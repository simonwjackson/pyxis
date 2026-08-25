{ pkgs, mkBunDerivation }:

{
  ytmusic = import ./plugin-ytmusic.nix { inherit pkgs; };
  pandora = import ./plugin-pandora.nix { inherit pkgs mkBunDerivation; };
  sonos = import ./plugin-sonos.nix { inherit pkgs; };
  soulseek = import ./plugin-soulseek.nix { inherit pkgs mkBunDerivation; };
}
