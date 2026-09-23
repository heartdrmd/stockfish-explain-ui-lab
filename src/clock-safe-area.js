// Fit the clock into its own right-hand area, preserving the requested
// position separately so resizing never overwrites a saved layout.
export function fitClockArea({ left, right, top, bottom, width, height, x, y, horizontalAt, heightAtWidth }) {
  if (horizontalAt || heightAtWidth) {
    // Recompute the board edge at each candidate size/height. Using the whole
    // board's widest corner would discard the empty space beside a tilted board.
    const at = scale => {
      const w = width * scale, h = heightAtWidth ? heightAtWidth(w) : height * scale;
      const cy = Math.max(top, Math.min(bottom - h, y));
      const band = horizontalAt ? horizontalAt(cy, cy + h) : {left, right};
      const fits = w <= band.right - band.left && h <= bottom - top;
      return {left:Math.max(band.left, Math.min(band.right-w, x)),top:cy,width:w,height:h,scale,fits};
    };
    let low=0, high=1;
    if (at(1).fits) low=1;
    else for(let i=0;i<24;i++) {
      const mid=(low+high)/2;
      if(at(mid).fits)low=mid;else high=mid;
    }
    const {fits,...fit}=at(width>0?Math.floor(width*low)/width:0);
    return fit;
  }
  const availableWidth = Math.max(0, right - left),
    availableHeight = Math.max(0, bottom - top);
  const scale =
    width > 0 && height > 0 ? Math.min(1, availableWidth / width, availableHeight / height) : 0;
  const fittedWidth = width * scale,
    fittedHeight = height * scale;
  return {
    left: Math.max(left, Math.min(right - fittedWidth, x)),
    top: Math.max(top, Math.min(bottom - fittedHeight, y)),
    width: fittedWidth,
    height: fittedHeight,
    scale,
  };
}

export function visibleBoardBounds(doc, band) {
  const frame = doc.getElementById("zagreb-board");
  if (frame && !frame.hidden) {
    const rect = frame.getBoundingClientRect(),
      points = frame.boardFootprint;
    if (Array.isArray(points) && points.length) {
      let xs=points.map(p=>p.x);
      if(band && Number.isFinite(rect.top)) {
        const top=band.top-rect.top, bottom=band.bottom-rect.top;
        xs=[];
        for(let i=0;i<points.length;i++) {
          const a=points[i], b=points[(i+1)%points.length];
          if(a.y>=top && a.y<=bottom)xs.push(a.x);
          for(const edge of [top,bottom])
            if(a.y!==b.y && edge>=Math.min(a.y,b.y) && edge<=Math.max(a.y,b.y))
              xs.push(a.x+(b.x-a.x)*(edge-a.y)/(b.y-a.y));
        }
        if(!xs.length)return {left:Infinity,right:-Infinity};
      }
      return {
        left: rect.left + Math.max(0, Math.min(rect.width, Math.min(...xs))),
        right: rect.left + Math.max(0, Math.min(rect.width, Math.max(...xs))),
      };
    }
    return {left:rect.left,right:rect.right};
  }
  const rect=doc.getElementById("board")?.getBoundingClientRect();
  if(band && rect && (band.bottom<rect.top || band.top>rect.bottom))return {left:Infinity,right:-Infinity};
  return {left:rect?.left || 0,right:rect?.right || 0};
}
export const visibleBoardRight = doc => visibleBoardBounds(doc).right;
