# The MCP server as a mountainous service app: the server plus its tailnet sidecar, which
# service apps expect as `<name>-tsnet` in the same profile.
{
  pkgs,
  mcp,
  tsnet,
}:

pkgs.runCommand "pyxis-mcp-app-${mcp.version}"
  {
    inherit (mcp) version;
    meta.mainProgram = "pyxis-mcp";
  }
  ''
    mkdir -p $out/bin
    ln -s ${mcp}/bin/pyxis-mcp $out/bin/pyxis-mcp
    ln -s ${tsnet}/bin/pyxis-tsnet $out/bin/pyxis-mcp-tsnet
  ''
