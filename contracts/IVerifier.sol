// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.6.10;

interface IVerifier {
    function verifyTx(uint[2] memory, uint[2][2] memory, uint[2] memory, uint[3] memory) external returns (bool);
}
