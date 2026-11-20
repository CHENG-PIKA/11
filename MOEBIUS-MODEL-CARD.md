---
license: apache-2.0
library_name: onnx
pipeline_tag: image-to-image
base_model: hustvl/Moebius
tags:
  - image-inpainting
  - inpainting
  - object-removal
  - diffusion
  - onnx
  - onnxruntime-web
  - webgpu
---

# Moebius (pretrained) — ONNX for WebGPU

ONNX exports of [Moebius](https://github.com/hustvl/Moebius) (hustvl, ECCV'26), a 0.22B-parameter
latent diffusion model for removing things from images, for in-browser inference with
[ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/) on WebGPU. Used by
[Card Anvil](https://github.com/Card-Anvil)'s watermark remover.

This repository carries the **general `pretrained` checkpoint** — Moebius before it was fine-tuned on
any one benchmark — rather than the Places2 fine-tune that
[simonw/Moebius-ONNX](https://huggingface.co/simonw/Moebius-ONNX) exports. The pretrained model was
distilled from [PixelHacker](https://github.com/hustvl/PixelHacker) over its 14M image–mask
pairs; the fine-tunes narrow it to one benchmark's photos.

## Files

| File               | Graph                                     | Input → output                                                                     | Size   |
| ------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------- | ------ |
| `unet.onnx`        | Student denoiser, `pretrained` checkpoint | `latent (B,9,64,64)`, `timesteps (B,)`, `input_ids (B,10)` → `noise (B,4,64,64)`   | 907 MB |
| `vae_encoder.onnx` | VAE encoder                               | `image (B,3,512,512)` → `moments (B,8,64,64)`                                      | 137 MB |
| `vae_decoder.onnx` | VAE decoder                               | `latent (B,4,64,64)` → `image (B,3,512,512)`                                       | 198 MB |

The UNet's inputs and outputs are identical to simonw/Moebius-ONNX's, so it drops into any pipeline
written for that export. The two VAE graphs are copied unchanged from
[simonw/Moebius-ONNX at `5bf1ef5`](https://huggingface.co/simonw/Moebius-ONNX/tree/5bf1ef5d2861ec01a727183a3f95dc64f352120e)
(the VAE is [PixelHacker's](https://huggingface.co/hustvl/PixelHacker/tree/main/vae)); all four
Moebius checkpoints share it.

## How the UNet was made

`export_unet.py` (here) is simonw's
[`reexport_unet_no_conv3d.py`](https://github.com/simonw/moebius-web/blob/main/python/reexport_unet_no_conv3d.py)
pointed at `pretrained/diffusion_pytorch_model.bin` from
[hustvl/Moebius at `cd01f47`](https://huggingface.co/hustvl/Moebius/tree/cd01f47fb648219d3fa605806c5ce00b713faa5e).
Each self-attention `pos_conv` Conv3d is replaced by its equivalent Conv2d so the graph compiles
on every WebGPU backend, then the model is exported with opset 18 at a static 512 × 512
(64 × 64 latent) — its cross-attention's position embedding is tied to that size.

Run on CPU (PyTorch 2.7.1), with upstream's CUDA-only teacher import (`fla`) skipped:

- Conv3d → Conv2d swap: max |Δ| 1.8e-6 against the unpatched model
- ONNX Runtime (CPU) against PyTorch: max |Δ| 3.1e-6
- 0 three-dimensional convolutions left in the graph

## Using it

The sampling loop runs outside the graphs; it must match Moebius's:

- VAE scaling factor **0.13025** (not Stable Diffusion's 0.18215): encode as
  `mean(moments[:, :4]) × 0.13025`, decode `latent / 0.13025`.
- UNet input: `concat([noisy latent (4), mask (1), masked image's latent (4)])`.
- `input_ids`: rows `[0…9]` conditioned, `[10…19]` unconditioned, for classifier-free guidance
  (2 to 2.5 per the paper).
- DDIM: `scaled_linear` betas from 0.00085 to 0.012, 1000 training steps, no clipping; 20 steps at
  strength 0.99 run 19.

## Licence

Apache-2.0, as is [Moebius's code and weights](https://github.com/hustvl/Moebius/blob/main/LICENSE)
and simonw/Moebius-ONNX. (hustvl's Hugging Face cards for Moebius and PixelHacker say MIT; their
GitHub repositories say Apache-2.0.) The files here are converted from those works: the UNet
re-exported as described above, the VAE graphs unchanged.

## Citation

```bibtex
@inproceedings{DuanAndXu2026Moebius,
  title     = {Moebius: 0.2B Lightweight Image Inpainting Framework with 10B-Level Performance},
  author    = {Kangsheng Duan and Ziyang Xu and Wenyu Liu and Xiaohu Ruan and Xiaoxin Chen and Xinggang Wang},
  year      = {2026},
  booktitle = {European Conference on Computer Vision (ECCV)}
}
```
