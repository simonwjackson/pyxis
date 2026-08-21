{ pkgs, mkBunDerivation }:

{
  ytmusic = import ./plugin-ytmusic.nix { inherit pkgs; };
  pandora = import ./plugin-pandora.nix { inherit pkgs mkBunDerivation; };
}
