# Draw Next interaction review

Open the frontend at http://localhost:8082/draw/. Sign in to Frappe on the same hostname before checking saves.

Use Chrome at 1512 × 862. Repeat the pointer checks with touch and pen where available.

1. Create a rectangle, ellipse, line, and multiline text.
2. Shift-click two objects. Confirm the combined frame remains visible after arrow-key movement.
3. Drag empty canvas across objects. Confirm the marquee selects them. Hold Shift to add objects.
4. Resize and rotate the combined selection. Confirm each member follows the frame.
5. Hold Shift while moving. Confirm movement stays horizontal or vertical.
6. Hold Alt/Option while moving. Confirm one independent copy appears after movement starts.
7. Press Escape during the duplicate drag. Confirm the original scene returns.
8. Hold Alt/Option on each resize handle. Confirm the center stays fixed.
9. Create shapes with Alt/Option. Confirm they grow from the start point.
10. Hold Space during creation. Confirm the pending shape moves without changing size.
11. Check Ctrl/Command A, D, X, C, and V. Paste a mixed selection into another tab.
12. Group with Ctrl/Command G. Ungroup with Ctrl/Command Shift G.
13. Double-click a group. Select a child. Press Escape to leave the group.
14. Overlap different shape types. Ctrl/Command-click repeatedly to select each layer.
15. Move and resize with Ctrl/Command held. Confirm alignment snapping stops.
16. Use the visible Undo and Redo controls. Confirm selection survives ordinary edits.
17. Confirm Undo is disabled on a new drawing. Make an edit, undo it, then confirm Redo becomes enabled.
18. Rotate a multi-selection. Confirm its combined boundary and handles disappear during the rotation.
19. Select the laser tool on a touchscreen. Confirm a single touch draws the laser trail without panning.
20. Focus the canvas. Use Tab and Shift Tab to select objects.
21. Inspect the object list with a screen reader.
22. Rename the drawing. Press Escape. Confirm the old title returns and the canvas receives focus.
23. Rename and edit a drawing. Wait for Saved. Reload the same URL. Confirm the title and scene return.
24. Disconnect the network after loading. Edit and reload. Check recovery after reconnecting.
25. Edit the same drawing in two tabs. Confirm a stale save does not overwrite the newer document.
26. Check existing wheel pan, Space pan, middle-button pan, pinch zoom, and cursor-centered zoom.
27. Check existing rotation snapping, corner-radius controls, labels, and direct text editing.

Multi-selections with rotated objects or text retain proportions during resize because the document model does not store skew.

The server stores committed documents in the custom Draw Next Drawing DocType. Its definition is in schema/draw-next-drawing.json.

The frontend requires a Frappe session. Failed saves retain a user-scoped IndexedDB draft and trigger a reload warning.

No automated tests were run for this change.
