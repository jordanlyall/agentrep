// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/IdentityRegistry.sol";
import "../src/ReputationRegistry.sol";

contract ReputationRegistryTest is Test {
    IdentityRegistry identity;
    ReputationRegistry reputation;
    address agentOwner = makeAddr("agentOwner");
    address reviewer = makeAddr("reviewer");
    address reviewer2 = makeAddr("reviewer2");

    function setUp() public {
        identity = new IdentityRegistry();
        reputation = new ReputationRegistry(address(identity));

        vm.prank(agentOwner);
        identity.register("https://example.com/agent.json"); // agentId = 1
    }

    function test_giveFeedback_stores_feedback() public {
        vm.prank(reviewer);
        reputation.giveFeedback(1, 85, 0, "tool_call", "accuracy", "https://mcp.example.com", "", bytes32(0));

        (int128 value, uint8 decimals, string memory tag1, string memory tag2, bool isRevoked) =
            reputation.readFeedback(1, reviewer, 0);

        assertEq(value, 85);
        assertEq(decimals, 0);
        assertEq(tag1, "tool_call");
        assertEq(tag2, "accuracy");
        assertFalse(isRevoked);
    }

    function test_giveFeedback_reverts_if_owner() public {
        vm.prank(agentOwner);
        vm.expectRevert("Cannot review own agent");
        reputation.giveFeedback(1, 85, 0, "tool_call", "accuracy", "", "", bytes32(0));
    }

    function test_getSummary_aggregates() public {
        vm.prank(reviewer);
        reputation.giveFeedback(1, 80, 0, "tool_call", "accuracy", "", "", bytes32(0));
        vm.prank(reviewer2);
        reputation.giveFeedback(1, 90, 0, "tool_call", "accuracy", "", "", bytes32(0));

        address[] memory clients = new address[](2);
        clients[0] = reviewer;
        clients[1] = reviewer2;

        (uint64 count, int128 summaryValue, uint8 summaryDecimals) =
            reputation.getSummary(1, clients, "", "");

        assertEq(count, 2);
        assertEq(summaryValue, 170);
        assertEq(summaryDecimals, 0);
    }

    function test_revokeFeedback() public {
        vm.prank(reviewer);
        reputation.giveFeedback(1, 85, 0, "tool_call", "accuracy", "", "", bytes32(0));
        vm.prank(reviewer);
        reputation.revokeFeedback(1, 0);

        (, , , , bool isRevoked) = reputation.readFeedback(1, reviewer, 0);
        assertTrue(isRevoked);
    }

    function test_getClients_returns_unique_reviewers() public {
        vm.prank(reviewer);
        reputation.giveFeedback(1, 80, 0, "", "", "", "", bytes32(0));
        vm.prank(reviewer2);
        reputation.giveFeedback(1, 90, 0, "", "", "", "", bytes32(0));

        address[] memory clients = reputation.getClients(1);
        assertEq(clients.length, 2);
    }
}
