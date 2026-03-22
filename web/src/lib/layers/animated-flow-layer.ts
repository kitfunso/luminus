import { PathLayer } from '@deck.gl/layers';
import { PathStyleExtension } from '@deck.gl/extensions';
import type { PathStyleExtensionProps } from '@deck.gl/extensions';
import type { CrossBorderFlow } from '../data-fetcher';

/**
 * Animated dashes over flow arcs to indicate direction of power flow.
 *
 * Dashes travel from source to destination. Speed scales with flow magnitude
 * so heavier flows appear faster. The animation works by prepending a
 * variable-length leader segment before the true source; as the leader grows
 * each frame the dash pattern shifts along the visible path.
 */

const DASH_COLOR: [number, number, number, number] = [255, 255, 255, 140];

/** Number of segments in the interpolated polyline between source and target. */
const PATH_SEGMENTS = 20;

/** Length of one full dash cycle in path-width multiples. */
const DASH_SIZE = 4;
const GAP_SIZE = 8;

/**
 * Linearly interpolate a polyline between two coordinates.
 * The extra `leaderFraction` parameter prepends a segment before the source
 * so the dash pattern appears to scroll forward.
 */
function buildPath(
  fromLon: number,
  fromLat: number,
  toLon: number,
  toLat: number,
  leaderFraction: number,
): [number, number][] {
  const dLon = toLon - fromLon;
  const dLat = toLat - fromLat;

  // Leader: invisible extension behind the source that shifts the dash phase
  const leaderLon = fromLon - dLon * leaderFraction;
  const leaderLat = fromLat - dLat * leaderFraction;

  const points: [number, number][] = [];
  for (let i = 0; i <= PATH_SEGMENTS; i++) {
    const t = i / PATH_SEGMENTS;
    points.push([
      leaderLon + t * (1 + leaderFraction) * dLon,
      leaderLat + t * (1 + leaderFraction) * dLat,
    ]);
  }
  return points;
}

interface AnimatedFlowDatum {
  path: [number, number][];
  flowMW: number;
}

export interface AnimatedFlowLayerOptions {
  flows: CrossBorderFlow[];
  /** Monotonically increasing value (e.g. performance.now()) driving the animation. */
  timestamp: number;
  opacity?: number;
}

export function createAnimatedFlowLayer({
  flows,
  timestamp,
  opacity = 140,
}: AnimatedFlowLayerOptions) {
  const color: [number, number, number, number] = [
    DASH_COLOR[0],
    DASH_COLOR[1],
    DASH_COLOR[2],
    opacity,
  ];

  const data: AnimatedFlowDatum[] = flows.map((f) => {
    // Speed proportional to flow magnitude, clamped to a sensible range
    const speed = Math.max(0.3, Math.min(2.0, f.flowMW / 2000));
    // Leader fraction cycles 0..1 to animate the dash pattern forward
    const leader = ((timestamp * speed * 0.0003) % 1);
    return {
      path: buildPath(f.fromLon, f.fromLat, f.toLon, f.toLat, leader),
      flowMW: f.flowMW,
    };
  });

  return new PathLayer<AnimatedFlowDatum, PathStyleExtensionProps<AnimatedFlowDatum>>({
    id: 'flow-direction-dashes',
    data,
    getPath: (d) => d.path,
    getColor: color,
    getWidth: 1.5,
    widthMinPixels: 1,
    widthMaxPixels: 3,
    getDashArray: [DASH_SIZE, GAP_SIZE],
    dashJustified: true,
    dashGapPickable: false,
    extensions: [new PathStyleExtension({ dash: true })],
    pickable: false,
    // Force full data rebuild every frame so the shifting leader is applied
    updateTriggers: {
      getPath: [timestamp],
    },
  });
}
