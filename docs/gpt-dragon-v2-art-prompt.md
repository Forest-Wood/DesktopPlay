# GPT 白龙桌宠素材记录

- 文件：`public/assets/gpt-dragon-v2.png`。
- 制作日期：2026-10-02。
- 工具：内置 OpenAI 图像生成工具，开启透明背景；将生成的 PNG 原样复制到项目，保留 alpha 通道。
- 造型参考：用户提供的白发龙角角色图，提取银白长发、白色龙角、尖耳、淡紫眼睛、结绳状发饰、白色服装、小龙翼与弯曲龙尾。
- 比例参考：项目现有 GPT 桌宠的大头、小身体比例和清晰轮廓。
- 本轮交付为独立的 Q 版半身素材。原 `gpt.png` 保留，可在 GPT 角色的设置中使用“换一张图片”选择本图。
- 本形象为按用户参考图生成的非官方二创桌宠，不代表 OpenAI 官方形象或认可。

## 验收结果

- 定稿为 1254×1254 RGBA PNG；alpha 范围 0–255，完全透明像素 749,440 个。
- 非透明区域边界为 `(70, 57, 1190, 1186)`，四周均有透明边距，龙角、翅膀、头发与尾巴未裁切。
- 浏览器实测四张对照图片的显示框均为 220×220；检查浅色、深色背景及左右翻转后，脸部、龙角和淡紫眼睛清晰，未见白底或明显杂边。
- [220×220 背景与翻转对照](screenshots/gpt-dragon-v2-preview.png)。
- [现有漫画气泡搭配预览](screenshots/gpt-dragon-v2-bubble.png)：使用本地演示额度，仅替换预览中的图片，未修改默认素材或程序接口。

## 实际生成提示词

```text
Use case: stylized-concept.
Asset type: square transparent PNG desktop-pet character for DesktopPlay, readable at 220 by 220 pixels.
Primary request: create one new white-dragon GPT chibi, HALF-BODY, using the reference character design and the established desktop-pet proportions.
Input images: The tall phone screenshot showing a silver-white-haired dragon woman is the CHARACTER DESIGN reference: preserve silver-white long hair, two curved white scaled dragon horns, pointed elf ears, pale lavender eyes, a small silver interwoven-knot rosette hair accessory, white costume with lavender shadows, simplified silver jewelry, pale small dragon wings, and a white scaled dragon tail. The mint-haired headset chibi is only a PROPORTIONS / rendering-style reference for a very large round head and small upper body, bold clean outlines and simple soft cel shading. Do not copy its headset, green palette or black oval eyes.
Subject and pose: one friendly calm white-dragon chibi with oversized head (about two thirds of the character height), soft rounded face, big clear pale-purple anime eyes with tiny highlights, tiny closed smiling mouth, subtle pink blush, looking forward with a slight head tilt. Long fluffy silver hair frames the face. The two complete white curved horns are distinct against lavender shading. Small white/lavender dragon wings emerge behind the shoulders, and a compact scaled dragon tail curls upward beside the upper body. A small pair of hands rests together in front. Modest white high-neck fantasy outfit with a few simplified silver accents, opaque and cute. Portrait ends at the waist, with no legs.
Composition: centered square sticker-like cutout. Keep the complete horns, hair tips, both wings, curled tail and lower half-body silhouette fully within the canvas, with at least 4 percent empty transparent margin on every side. Occupy about 90 percent of the canvas. Large readable face, compact wings and tail, visually balanced silhouette. The white body must remain opaque; only outside the character is transparent.
Style: polished 2D anime chibi desktop mascot, dark muted lavender outlines, soft minimal cel shading, simple bold readable shapes instead of fine detail. Palette silver-white, pearl gray, pale lavender, warm ivory skin and small pink blush. Gentle even lighting.
Scene/backdrop: truly transparent alpha background.
Avoid: phone screenshot UI, status bars, black bars, white background, checkerboard pattern, floating cloud companion, additional characters, speech bubbles, captions, lettering, border, watermark, glow, cast shadow, full-body/tall human proportions, cropped horns, cropped wing tips, cropped tail, headphones, mint-green accents.
```

## 定稿调整提示词

首稿的右侧和底部留白较少，使用内置图像编辑工具保留角色设计并增加透明安全边距。以上文件保存的是调整后的定稿。

```text
Edit this desktop-pet PNG only to improve framing. Preserve the same white dragon chibi identity, facial expression, lavender eyes, horns, hair, hands, white outfit, silver accessories, wings, tail, colors, outline style, half-body proportions, and all internal illustration details. Scale the entire complete character down slightly inside a square transparent canvas so there is a generous clear transparent margin of about 7 percent of canvas width on EVERY side, including beyond the tallest horn, rightmost tail and lowest hair/garment edges. Keep the complete character silhouette; do not crop or cut off any horn, wing, hair or tail tip. Character remains centered and fills about 85 percent of the canvas. The skin, white hair and outfit should be opaque; background must have genuine alpha transparency. No scene, ground, cast shadow, white backdrop, checkerboard, border, extra objects, text or watermark.
```
