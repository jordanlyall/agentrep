// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./IdentityRegistry.sol";

contract ReputationRegistry {
    IdentityRegistry public identityRegistry;

    struct Feedback {
        int128 value;
        uint8 valueDecimals;
        string tag1;
        string tag2;
        string endpoint;
        string feedbackURI;
        bytes32 feedbackHash;
        bool isRevoked;
    }

    // agentId => client => feedbackIndex => Feedback
    mapping(uint256 => mapping(address => Feedback[])) private _feedback;
    // agentId => list of unique clients
    mapping(uint256 => address[]) private _clients;
    mapping(uint256 => mapping(address => bool)) private _isClient;

    event NewFeedback(
        uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex,
        int128 value, uint8 valueDecimals, string tag1, string tag2,
        string endpoint, string feedbackURI, bytes32 feedbackHash
    );
    event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex);

    constructor(address identityRegistry_) {
        identityRegistry = IdentityRegistry(identityRegistry_);
    }

    function giveFeedback(
        uint256 agentId, int128 value, uint8 valueDecimals,
        string calldata tag1, string calldata tag2,
        string calldata endpoint, string calldata feedbackURI, bytes32 feedbackHash
    ) external {
        require(identityRegistry.ownerOf(agentId) != msg.sender, "Cannot review own agent");

        uint64 idx = uint64(_feedback[agentId][msg.sender].length);
        _feedback[agentId][msg.sender].push(Feedback(
            value, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash, false
        ));

        if (!_isClient[agentId][msg.sender]) {
            _clients[agentId].push(msg.sender);
            _isClient[agentId][msg.sender] = true;
        }

        emit NewFeedback(agentId, msg.sender, idx, value, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash);
    }

    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external {
        require(feedbackIndex < _feedback[agentId][msg.sender].length, "Invalid index");
        _feedback[agentId][msg.sender][feedbackIndex].isRevoked = true;
        emit FeedbackRevoked(agentId, msg.sender, feedbackIndex);
    }

    function readFeedback(uint256 agentId, address client, uint64 index)
        external view returns (int128, uint8, string memory, string memory, bool)
    {
        Feedback storage f = _feedback[agentId][client][index];
        return (f.value, f.valueDecimals, f.tag1, f.tag2, f.isRevoked);
    }

    function getSummary(uint256 agentId, address[] calldata clients, string calldata tag1, string calldata tag2)
        external view returns (uint64 count, int128 summaryValue, uint8 summaryDecimals)
    {
        bool filterTag1 = bytes(tag1).length > 0;
        bool filterTag2 = bytes(tag2).length > 0;

        for (uint256 i = 0; i < clients.length; i++) {
            Feedback[] storage fb = _feedback[agentId][clients[i]];
            for (uint256 j = 0; j < fb.length; j++) {
                if (fb[j].isRevoked) continue;
                if (filterTag1 && keccak256(bytes(fb[j].tag1)) != keccak256(bytes(tag1))) continue;
                if (filterTag2 && keccak256(bytes(fb[j].tag2)) != keccak256(bytes(tag2))) continue;
                count++;
                summaryValue += fb[j].value;
                summaryDecimals = fb[j].valueDecimals;
            }
        }
    }

    function getClients(uint256 agentId) external view returns (address[] memory) {
        return _clients[agentId];
    }

    function getLastIndex(uint256 agentId, address client) external view returns (uint64) {
        return uint64(_feedback[agentId][client].length);
    }
}
