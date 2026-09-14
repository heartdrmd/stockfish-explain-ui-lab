# Board material atlas

`board-finish-atlas.webp` is a single linear-data texture shared by the fifteen
reworked board finishes. Graphite & chalk does not use it. It contains no baked
illumination, shadows, ambient occlusion, or reflections.

Four veneer fields are derived from CC0 diffuse textures by **Jenelle van Heerden,
Poly Haven**. The source crops are normalized into tint-independent material data:

- [White Maple Veneer](https://polyhaven.com/a/white_maple_veneer)
- [Smoked Walnut Veneer](https://polyhaven.com/a/smoked_walnut_veneer)
- [Rosewood Veneer 02](https://polyhaven.com/a/rosewood_veneer_02)
- [Oak Veneer 02](https://polyhaven.com/a/oak_veneer_02)
- [Poly Haven CC0 license](https://polyhaven.com/license)

Use each asset's **4K Diffuse JPG** (`<asset>_diff_4k.jpg`) to reproduce:

```
python3 scripts/generate-board-atlas.py --sources /path/to/source-directory
```

Requires numpy and Pillow. Remaining fields (burl, bird's eyes, exotic wood
figure, ceramic, travertine, basalt and marble seams) are authored procedurally.
They are interpretations informed by reference materials, not scans of the
particular chessboard or verified reproductions of every wood species.

Real-board finish references:

- https://thechessstore.com/standard-walnut-maple-chess-board-1-75-squares/
- https://thechessstore.com/walnut-burl-maple-molded-edge-chess-board-1-75-squares/
- https://thechessstore.com/standard-macassar-ebony-maple-chess-board-1-75-squares/

The wood uses a satin polyurethane-like response. Grain follows separate veneer
cuts and frame rails. Stone is honed; ceramic and stained boards use a restrained
matte finish. The atlas is loaded once when needed, packaged with a Vite content
hash, and shared/disposed with its scene. Original source JPGs are not deployed.
