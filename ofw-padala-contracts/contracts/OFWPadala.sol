// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
}

contract OFWPadala {
    struct Remittance {
        address sender;
        address recipient;
        uint256 amount;
        address token;
        bool isCompleted;
    }

    mapping(bytes32 => Remittance) public remittances;

    function sendPadala(bytes32 _txId, address _recipient, uint256 _amount, address _token) external {
        require(remittances[_txId].sender == address(0), "Transaction ID exists");
        require(IERC20(_token).transferFrom(msg.sender, address(this), _amount), "Transfer failed");

        remittances[_txId] = Remittance({
            sender: msg.sender, recipient: _recipient, amount: _amount, token: _token, isCompleted: false
        });
    }

    function claimPadala(bytes32 _txId) external {
        Remittance storage r = remittances[_txId];
        require(msg.sender == r.recipient, "Not recipient");
        require(!r.isCompleted, "Claimed");

        r.isCompleted = true;
        require(IERC20(r.token).transfer(r.recipient, r.amount), "Transfer failed");
    }
}