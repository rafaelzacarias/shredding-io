# shredding-io

An immersive, dependency-free WebGL shredder game. Seen from directly above the hopper, throw procedural 3D objects toward the twin cutter shafts. Objects can bounce off the walls, but the sloped feed panels always send them into the teeth, where they are eaten at the machine's own steady pace.

Nothing is a coloured box: every object is built out of parts in [js/parts.js](js/parts.js) — keycaps on a plate, bells and gears in a clock, glass over a phone, papers inside a tray — and the cut line destroys those parts one at a time, in the order the teeth reach them. So the keys pop off row by row and bounce back in for a second helping, the CD cracks into shards instead of being cut, the clipboard's steel clip stalls the whole machine, the cardboard tray folds in on itself, and the phone's battery only gets punctured once the case around it has gone. Whatever is not in the teeth yet stays whole, and none of it depends on how hard you threw the thing.

Nothing falls the same way either. Air resistance follows the face an object turns into the wind, so a sheet of paper sails, stalls and tips over on itself all the way down while a phone drops straight and lands hard. Where something comes to rest is worked out from how it is lying, so a sheet ends up flush with the deck and a stress cube sits up on a face; landing on a corner makes it rock down onto a face, and a face too small to hold it up sends it toppling onto one that can. Discs and clocks run on their rim before lying down.

Nothing is laid flat to be destroyed. The teeth take an object once it is down and lying on a face that holds it, and then feed it in exactly that pose: a sheet goes through the way it landed, along whichever of its own edges is pointing at the nip, while anything too thick to pass between the drums is held over the nip and ground away from the bottom up, sinking as it goes.

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
