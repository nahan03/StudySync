# Enchanted Forest CSS Reference Guide

## Color Palette

### CSS Custom Properties
```css
--bg-base:    #06170F       /* Deep forest background */
--bg-secondary: #0B2015     /* Secondary background layer */
--emerald:    #0D2F20       /* Primary forest color */
--moss:       #355E3B       /* Moss green for details */
--accent:     #FFD56B       /* Golden firefly accent */
--glow:       #C4FFB3       /* Emerald glow (primary UI accent) */
--text:       #F8F5EC       /* Warm cream text */
--fog:        #8A9D7E       /* Muted forest gray */
```

## Key Animations Reference

### Background Animations
```css
/* Base scene breathing */
animation: dm-scene-sway 48s ease-in-out infinite;

/* Canopy light glow pulsing */
animation: dm-canopy-glow 22s ease-in-out infinite;

/* Volumetric light rays */
animation: dm-sunbeam 24s ease-in-out infinite;
animation: dm-rays-flicker 32s ease-in-out infinite;

/* Atmospheric effects */
animation: dm-mist-flow 38s ease-in-out infinite;
animation: dm-mist-breathe 32s ease-in-out infinite;

/* Ambient wind effect */
animation: dm-wind-sweep 26s ease-in-out infinite;
animation: dm-wind-pulse 48s ease-in-out infinite;

/* Overall glow wave */
animation: dm-glow-wave 28s ease-in-out infinite;
animation: dm-glow-fade 36s ease-in-out infinite;
```

### Tree Animations (Parallax)
```css
/* Far background trees - slowest */
animation: dm-tree-float-far 56s ease-in-out infinite;

/* Middle trees - moderate */
animation: dm-tree-float-mid 34s ease-in-out infinite;

/* Near trees - faster */
animation: dm-tree-float-near 26s ease-in-out infinite;
```

### Particle Animations
```css
/* Magical spores drifting upward */
animation: dm-particle-drift linear infinite;
/* Typical duration: 12-20s per particle */

/* Fireflies pulsing glow */
animation: dm-firefly-glow 3.2s ease-in-out infinite alternate;

/* Fireflies floating movement */
animation: dm-firefly-float 22s linear infinite;

/* Falling leaves */
animation: dm-leaf-fall linear infinite;
animation: dm-leaf-sway 12s ease-in-out infinite;
```

### Foreground Element Animations
```css
/* Glowing mushroom pulse */
animation: dm-mushroom-glow 3-4s ease-in-out infinite;

/* Fern gentle sway */
animation: dm-fern-sway 6s ease-in-out infinite;

/* Wildflower glow pulse */
animation: dm-flower-pulse 5s ease-in-out infinite;
```

## Glass Morphism Components

### Standard Glass Panel
```css
.dm-panel {
  background: rgba(11, 32, 21, 0.25);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(196,255,179,0.08);
}
```

### Strong Glass Card (Overlay)
```css
.dm-card {
  background: rgba(8, 18, 12, 0.65);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1.5px solid rgba(196,255,179,0.12);
}
```

### Topbar (Semi-transparent)
```css
.dm-topbar {
  background: rgba(3, 8, 5, 0.35);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(196,255,179,0.08);
}
```

## Button Styles

### Primary Button
```css
.dm-btn-primary {
  background: linear-gradient(135deg, rgba(61, 190, 63, 0.85), rgba(196,255,179,0.65));
  color: #06170F;
  box-shadow: 0 4px 16px rgba(61, 190, 63, 0.35);
}
.dm-btn-primary:hover {
  box-shadow: 0 8px 28px rgba(61, 190, 63, 0.5);
}
```

### Ghost Button
```css
.dm-btn-ghost {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(196,255,179,0.12);
  color: var(--fog);
}
.dm-btn-ghost:hover {
  background: rgba(196,255,179,0.08);
  border-color: rgba(196,255,179,0.2);
}
```

## Glow Effects

### Firefly Glow
```css
box-shadow: 0 0 20px 8px rgba(196,255,179,0.2);
filter: drop-shadow(0 0 16px rgba(196,255,179,0.8));
```

### Timer Ring Glow (Running)
```css
box-shadow: 0 0 40px 8px rgba(196,255,179,0.25);
```

### Active Progress Node
```css
box-shadow: 0 0 0 3px rgba(196,255,179,0.12), 0 0 14px rgba(196,255,179,0.35);
```

## Opacity Levels

### UI Elements
- **Opaque interactive**: 0.95-1.0
- **Strong glass**: 0.65
- **Medium glass**: 0.25-0.35
- **Subtle glass**: 0.04-0.08
- **Barely visible**: 0.01-0.02

### Animation Opacity Range
- **Fireflies**: 0.0 to 0.7
- **Particles**: 0.0 to 0.3
- **Leaves**: 0.0 to 0.72
- **Rays**: 0.74 to 0.98

## Blur Amounts

| Component | Blur |
|-----------|------|
| Topbar | 28px / 20px (-webkit) |
| Strong Glass Card | 16px |
| Medium Glass | 12px |
| Sidebar | 8px |
| Search Input | Not blurred |

## Positioning

### Mushrooms (Bottom)
- Large: 24px from bottom
- Medium: 28-32px from bottom
- Small: 20-36px from bottom
- Left side: 8%, 14%, 18%
- Right side: 7%, 12%, 18%

### Fireflies (Floating)
- Left: 12%, 34%, 56%, 74%, 88%
- Top: 11%, 18%, 22%, 24%, 27-28%

### Trees (Background)
- Left: -12% (offscreen left)
- Width: 124% (overflow)
- Bottom: 0 (to bottom edge)

## Performance Tips

### Use `will-change` for
- `.dm-particle`
- `.dm-bg-trees`
- `.dm-bg-glow`
- `.dm-bg-wind`
- `.dm-bg-mist`

### Transform-Only (GPU)
```css
/* Fast */
transform: translateX() translateY() scale() rotate();

/* Slower - avoid on animated elements */
left/top/width/height changes
opacity changes (use sparingly)
```

### Stagger Animations
```javascript
/* In HTML */
<div style="animation-delay: 0s;"></div>
<div style="animation-delay: 1.5s;"></div>
<div style="animation-delay: 3s;"></div>
```

## Cross-Browser Support

### Backdrop Filter
```css
backdrop-filter: blur(16px);        /* Chrome, Edge, Safari */
-webkit-backdrop-filter: blur(16px); /* Safari 9+ */
/* Fallback for older browsers: use solid background */
```

### CSS Variables
Widely supported in all modern browsers. Fallbacks:
```css
background: linear-gradient(...);  /* Fallback */
background: linear-gradient(180deg, var(--emerald), var(--glow));
```

### Gradients
All gradient directions supported. Use standard syntax.

## Testing Performance

### Check Animation Frame Rate
```javascript
// In browser console
requestAnimationFrame(() => {
  console.timeEnd('frame');
  console.time('frame');
})
```

### Profile in DevTools
1. Open Chrome DevTools
2. Go to Performance tab
3. Record for 3-5 seconds
4. Look for dropped frames (60fps = smooth)

### Lighthouse Audit
- Performance: Should be 90+
- Check "Avoid large paint operations"
- Check "Avoid forced synchronous layouts"

## Customization

### To change glow color:
```css
--glow: #C4FFB3;  /* Change this value */
```

### To adjust animation speed:
```css
animation: dm-scene-sway 48s ease-in-out infinite;
                         ↑ Change this value (in seconds)
```

### To adjust transparency:
```css
background: rgba(11, 32, 21, 0.25);
                              ↑ Change from 0-1
```

## Accessibility Considerations

### Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### High Contrast
Test in Windows High Contrast mode. Background should still be readable.

### Keyboard Navigation
All interactive elements keyboard accessible (already implemented in existing code).

## Debugging Checklist

- [ ] Colors match specification (#06170F, #C4FFB3, etc.)
- [ ] Animations run smoothly without stuttering
- [ ] No layout shift when loading
- [ ] Fog properly obscures bottom elements
- [ ] Tree layers have proper depth (far < mid < near)
- [ ] Fireflies glow visible in normal lighting
- [ ] Glass morphism blur visible (not browser default)
- [ ] No console errors for CSS
- [ ] Responsive at 375px and 1920px widths
