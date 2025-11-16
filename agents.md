# Perspective system overview

- **Side view (battles/interiors):** Horizontal platforming with gravity, jumping on <kbd>K</kbd>, crouching on <kbd>S</kbd>, and swordplay on <kbd>J</kbd>. Areas are stitched together two screens at a time and reuse persistent enemies per area.
- **Raised view (towns):** Orthographic street perspective entered from white town tiles on the overworld. Movement keeps the side-view combat verbs but maps <kbd>W</kbd> to walk away from the camera and <kbd>S</kbd> to walk toward it, letting Link roam plazas two areas long (each two screens wide) without scaling or gravity.
- **Top view (overworld):** Tile-based map where movement happens one tile step at a time. Reaching the right edge returns to the starting side-view area, and stepping onto a white town tile transitions into the raised view.
