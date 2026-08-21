{ pkgs, proseql }:

let
  source = pkgs.runCommand "pyxis-core-source" { } ''
    mkdir -p $out/services $out/.cache
    cp ${../Cargo.toml} $out/Cargo.toml
    cp ${../Cargo.lock} $out/Cargo.lock
    cp -r ${../services/pyxis} $out/services/pyxis
    cp -r ${proseql} $out/.cache/proseql
  '';
in
pkgs.rustPlatform.buildRustPackage {
  pname = "pyxis-core";
  version = "2.0.0";
  src = source;

  cargoLock.lockFile = ../Cargo.lock;
  cargoBuildFlags = [ "-p" "pyxis" "--bin" "pyxis" ];
  doCheck = false; # `just verify` is the authoritative multi-language gate.

  meta = {
    description = "Account-scoped music service core";
    mainProgram = "pyxis";
  };
}
