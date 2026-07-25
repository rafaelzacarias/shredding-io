# shredding-io

An immersive, dependency-free WebGL shredder game. Seen from directly above the hopper, throw procedural 3D objects toward the twin cutter shafts. Objects can bounce off the walls, but the sloped feed panels always send them into the teeth, where they are eaten at the machine's own steady pace.

Only the edge caught in the teeth is destroyed: the rest of the object stays whole until the cut reaches it. Paper bends over the drums and combs out into strips, while hard things resist, judder, snap off in chunks and take longer to get through — and none of it depends on how hard you threw them.

## Run

The game uses native JavaScript modules, so serve the repository over HTTP:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Controls

- Flick anywhere on the scene in any direction to throw the selected object into the hopper.
- Press `1`–`0` to throw an object.
- Press `M` for sound, `Z` for zen feed, and `P` for full power.
- A tap or click drops the selected object straight into the hopper.

Progress remains in local browser storage under the original `shredding-total` key.

## Requirements

A current browser with WebGL and JavaScript module support is required. The interface provides a fallback message when WebGL is unavailable and reduces motion automatically when requested by the operating system.
