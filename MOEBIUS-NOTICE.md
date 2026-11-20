# Moebius integration notices

- Model: Moebius (Duan, Xu et al., ECCV 2026), https://github.com/hustvl/Moebius
- ONNX general pretrained checkpoint: CardAnvilModels/Moebius-pretrained-ONNX, revision 8a9bc45a6fe2c59ee5aa967a700a726b36cc2df7. Pinned URLs, original byte sizes and SHA-256 provenance appear in moebius.json.
- VAE graphs and browser pipeline reference: https://github.com/simonw/moebius-web and https://huggingface.co/simonw/Moebius-ONNX.
- Apache-2.0; retain MOEBIUS-LICENSE.txt and MOEBIUS-MODEL-CARD.md.

Local modifications: numeric helpers ported from TypeScript to JavaScript; canvas conversion uses the existing KV Studio letterbox/mask pipeline; staged session loading; explicit tensor disposal; cancellable worker lifecycle; Chinese progress and error messages; chunked browser caching; finite-output validation. Weights remain unchanged and download directly to the visitor from pinned Hugging Face URLs. No inference API or image upload is used.

The checkpoint runs at 512×512 internally. Export dimensions do not change its native generation resolution. More sampling steps do not guarantee a better result. This integration requires a usable WebGPU adapter; LaMa and MI-GAN remain available on CPU.
