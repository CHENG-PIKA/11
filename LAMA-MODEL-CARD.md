---
license: apache-2.0
library_name: onnx
pipeline_tag: image-to-image
base_model: Carve/LaMa-ONNX
base_model_relation: quantized
tags:
  - inpainting
  - object-removal
  - lama
  - onnx
  - quantized
  - webgpu
---

# LaMa (big-lama) ONNX with int4/int8 weights, 37 MB

A weight-only quantized copy of [Carve/LaMa-ONNX](https://huggingface.co/Carve/LaMa-ONNX) `lama_fp32.onnx` (208 MB), made for object removal in the browser with onnxruntime-web. Inputs and outputs are unchanged. Only the convolution weights are stored as int4/int8, which brings the download to 37 MB.

## Files

| File | Use it when |
|---|---|
| **`lama_int4_int8_r4.onnx`** (recommended) | Always. Same weights as below, with the Fourier units rewritten so that no tensor has more than 4 dimensions. Runs on WebGPU in Chrome, Safari and Firefox. |
| `lama_int4_int8.onnx` | Kept for reference. Runs on Chrome and Safari WebGPU, but fails on Firefox WebGPU (see below). |

Both files give the same outputs (max difference below 1e-4).

## Inputs and outputs

| Name | Type | Meaning |
|---|---|---|
| `image` | float32 `[1, 3, 512, 512]` | RGB, divided by 255 |
| `mask` | float32 `[1, 1, 512, 512]` | `1` = remove, `0` = keep |
| `output` | float32 `[1, 3, 512, 512]` | RGB, already in `[0, 255]` |

Count every non-zero mask pixel as a hole, including the soft edges of a brush stroke. If soft edges are treated as "keep", LaMa spreads the object's edge colours into the hole and leaves a ghost.

## Required session option

Create the session with `session.disable_quant_qdq = "1"`. ONNX Runtime then constant-folds each `DequantizeLinear → Reshape` weight chain into fp32 at load time, and inference runs exactly like the fp32 model.

onnxruntime-web:

```js
const session = await ort.InferenceSession.create(modelBuffer, {
  executionProviders: ['webgpu'], // or 'wasm'
  extra: { session: { disable_quant_qdq: '1' } },
})
```

Python:

```python
import onnxruntime as ort
so = ort.SessionOptions()
so.add_session_config_entry("session.disable_quant_qdq", "1")
session = ort.InferenceSession("lama_int4_int8_r4.onnx", so)
```

The model needs opset 21, which adds blocked `DequantizeLinear` and INT4. It was tested with onnxruntime 1.30.0 (Python, CPU) and onnxruntime-web 1.30.0 (WebGPU and wasm). In our tests the fp32 base model failed on the onnxruntime-web WebGPU backend in versions 1.16.3 and 1.22.0, so use 1.30.0 or newer for WebGPU.

## How it was made

Weights are quantized symmetrically, block-wise along the flattened input dimension of each Conv/ConvTranspose weight:

| Layers | Format | fp32 → stored |
|---|---|---|
| FFC `convl2l`, `convl2g`, `convg2l` and the 384×384 1×1 Fourier-unit convs (144 layers) | int4, block 32, fp16 scales | 169.9 MB → 23.9 MB |
| Everything else: spectral-transform convs, down/up-sampling, first and last layers (81 layers) | int8, block 64, fp32 scales | 33.7 MB → 8.7 MB |

Quantizing every layer to int4 breaks the model: hole-only PSNR against fp32 drops to 1–12 dB. That is why the sensitive layers stay int8.

Reproduce with the included `quantize.py` (onnx 1.23.2, numpy 2.5.4):

```sh
python quantize.py lama_fp32.onnx lama_int4_int8.onnx \
  --int4 'conv(l2g|g2l|l2l)\.weight|anon:384x384x1x1' --b4 32 --fp16-scales
```

## The rank ≤ 4 rewrite (`_r4`)

Each of the 36 Fourier units in the export computes its FFT with 5-D tensors: a trailing size-1 axis for matrix–vector products, and a size-2 axis that stacks the real and imaginary parts. onnxruntime-web declares index types for tensors of rank 5 or more as `array<u32, N>` WGSL aliases, and Firefox's WebGPU (wgpu/Naga) turns those aliases into different Metal types. The shader then fails to compile with `no matching function for call to 'set_output_by_indices' … no known conversion from 'input_0_indices_t' to 'output_indices_t'`.

`r4.py` replaces those parts with equivalent rank ≤ 4 ops:

- `Squeeze(Sub/Add(MatMul(M, Unsqueeze(X, -1)), …))` becomes `Sub/Add(MatMul(X, Mᵀ), …)`.
- Stacking real/imag into channels (`Unsqueeze` → `Concat` → `Transpose` → `Reshape`) becomes `Reshape(·, [0, 0, -1])` → `Concat(axis=2)` → `Reshape`.
- Splitting channels back (`Reshape` to 5-D → `Transpose` → `Gather`) becomes `Reshape(·, [0, C, -1])` → `Split` → `Reshape`.

It also drops the shape-computation nodes this leaves unused (18,731 → 16,677 nodes). The weights are untouched. On onnxruntime CPU the outputs match `lama_int4_int8.onnx` to within float rounding (PSNR 168 dB), and Chrome WebGPU results are pixel-identical.

```sh
python r4.py lama_int4_int8.onnx lama_int4_int8_r4.onnx
```

## Closeness to fp32

The test ran 8 cases: 3 object removals and 5 random-stroke masks on example photos. Each case went through the same pipeline: crop around the mask, resize to 512, run the model, resize back, and replace only the masked pixels. The scores are hole-only PSNR against the fp32 model:

| Model | Size | Mean | Worst |
|---|---|---|---|
| fp32 (`lama_fp32.onnx`) | 208 MB | n/a | n/a |
| **this model** | **37 MB** | **31.4 dB** | **24.2 dB** |
| int8 only (block 64) | 59 MB | 36.8 dB | 31.2 dB |
| OpenCV Zoo `inpainting_lama_2025jan.onnx` (int8, block 8) | 93 MB | 35.8 dB | 26.7 dB |

These numbers measure closeness to fp32, not quality. Side by side, the fills from this model could not be told apart from the fp32 ones.

## Speed

After folding, the weights are plain fp32, so speed matches the fp32 model. Measured on an Apple M1 Pro with onnxruntime-web 1.30.0, for one 512×512 inpaint after the first:

| Browser (WebGPU) | `lama_int4_int8_r4.onnx` |
|---|---|
| Chrome 155 | about 0.9 s |
| WebKit (Safari 26.6 engine) | about 2.3 s |
| Firefox 155 | about 3.0 s |

On 8-thread wasm (no WebGPU) a run took about 4.9 s with the original graph. The first run is slower because it includes creating the session (about 7–9 s) and compiling the shaders.

## Credits and license

- **LaMa**: Suvorov et al., *Resolution-robust Large Mask Inpainting with Fourier Convolutions*, WACV 2022. Code: [advimman/lama](https://github.com/advimman/lama) (Apache-2.0).
- **ONNX export**: [Carve/LaMa-ONNX](https://huggingface.co/Carve/LaMa-ONNX) (Apache-2.0).
- **Training data**: Places2. Please credit the Places2 authors.
- **Changes in this copy**: convolution weights were quantized as described above, and in `lama_int4_int8_r4.onnx` the Fourier units were rewritten to rank ≤ 4 ops as described above. Nothing else was changed.

Released under the Apache License 2.0; see `LICENSE`.

```bibtex
@article{suvorov2021resolution,
  title={Resolution-robust Large Mask Inpainting with Fourier Convolutions},
  author={Suvorov, Roman and Logacheva, Elizaveta and Mashikhin, Anton and Remizova, Anastasia and Ashukha, Arsenii and Silvestrov, Aleksei and Kong, Naejin and Goka, Harshith and Park, Kiwoong and Lempitsky, Victor},
  journal={arXiv preprint arXiv:2109.07161},
  year={2021}
}
```

SHA-256:

- `lama_int4_int8_r4.onnx`: `4e3b78a253eb4abf21896811c928ffa91214b916e5d6ced24cecdd7999b4aaa1`
- `lama_int4_int8.onnx`: `d69db99d833ae6fb194fbbe43aa77de5369fff2d906053d693c16ae96ce9a312`
