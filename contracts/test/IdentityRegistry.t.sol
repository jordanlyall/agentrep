// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/IdentityRegistry.sol";

contract IdentityRegistryTest is Test {
    IdentityRegistry registry;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        registry = new IdentityRegistry();
    }

    function test_register_mints_nft() public {
        vm.prank(alice);
        uint256 agentId = registry.register("https://example.com/agent.json");
        assertEq(agentId, 1);
        assertEq(registry.ownerOf(1), alice);
    }

    function test_register_increments_id() public {
        vm.prank(alice);
        uint256 id1 = registry.register("https://example.com/a.json");
        vm.prank(bob);
        uint256 id2 = registry.register("https://example.com/b.json");
        assertEq(id1, 1);
        assertEq(id2, 2);
    }

    function test_agentURI_returns_uri() public {
        vm.prank(alice);
        uint256 agentId = registry.register("https://example.com/agent.json");
        assertEq(registry.tokenURI(agentId), "https://example.com/agent.json");
    }

    function test_setAgentURI_by_owner() public {
        vm.prank(alice);
        uint256 agentId = registry.register("https://example.com/old.json");
        vm.prank(alice);
        registry.setAgentURI(agentId, "https://example.com/new.json");
        assertEq(registry.tokenURI(agentId), "https://example.com/new.json");
    }

    function test_setAgentURI_reverts_non_owner() public {
        vm.prank(alice);
        uint256 agentId = registry.register("https://example.com/agent.json");
        vm.prank(bob);
        vm.expectRevert();
        registry.setAgentURI(agentId, "https://evil.com/agent.json");
    }

    function test_setMetadata_and_getMetadata() public {
        vm.prank(alice);
        uint256 agentId = registry.register("https://example.com/agent.json");
        vm.prank(alice);
        registry.setMetadata(agentId, "agentWallet", abi.encode(alice));
        bytes memory val = registry.getMetadata(agentId, "agentWallet");
        assertEq(abi.decode(val, (address)), alice);
    }

    function test_totalAgents() public {
        vm.prank(alice);
        registry.register("https://example.com/a.json");
        vm.prank(bob);
        registry.register("https://example.com/b.json");
        assertEq(registry.totalAgents(), 2);
    }
}
