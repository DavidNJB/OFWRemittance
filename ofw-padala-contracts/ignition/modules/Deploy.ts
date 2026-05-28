import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("DeployModule", (m) => {
  const mockToken = m.contract("MockToken");
  const padala = m.contract("OFWPadala");

  return { mockToken, padala };
});