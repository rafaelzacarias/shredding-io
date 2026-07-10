# shredding-io

An immersive, dependency-free WebGL shredder game. Throw procedural 3D objects into a working twin-shaft machine and watch them break into physical debris.

## Run

The game uses native JavaScript modules, so serve the repository over HTTP:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Controls

- Drag an object upward and release, or drag anywhere on the scene to throw the selected object.
- Press `1`–`0` to throw an object.
- Press `M` for sound, `Z` for zen feed, and `P` for full power.
- A tap or click throws the selected object at a default speed.

Progress remains in local browser storage under the original `shredding-total` key.

## Requirements

A current browser with WebGL and JavaScript module support is required. The interface provides a fallback message when WebGL is unavailable and reduces motion automatically when requested by the operating system.
