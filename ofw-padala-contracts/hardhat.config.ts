import type { HardhatUserConfig } from "hardhat/config";
import toolbox from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import ignition from "@nomicfoundation/hardhat-ignition";

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  plugins: [toolbox, ignition] // <-- This is the magic line Hardhat 3 requires!
};

export default config;