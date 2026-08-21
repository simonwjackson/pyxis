{ pkgs }:

pkgs.buildGoModule {
  pname = "pyxis-tsnet";
  version = "1.0.0";
  src = ../services/pyxis-tsnet;
  # Same tailscale dependency closure as the proven Ossicle edge.
  vendorHash = "sha256-evPFoKC8Yd2gXvg/R+pBGt9YlVBVAi87llHnaG0jXWY=";
  env.CGO_ENABLED = 0;

  meta = {
    description = "Tailnet-only HTTPS edge for Pyxis";
    mainProgram = "pyxis-tsnet";
  };
}
