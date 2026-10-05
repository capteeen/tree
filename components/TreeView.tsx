'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import Tree2D from './Tree2D';
import type { Ca } from '@/lib/types';

const Tree3D = dynamic(() => import('./Tree3D'), { ssr: false });

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** 3D voxel tree when WebGL is available, recursive 2D pixel tree otherwise. */
export default function TreeView(props: { rootCa: Ca; focusCa?: Ca | null; onSelect?: (ca: Ca) => void }) {
  const [gl, setGl] = useState<boolean | null>(null);
  useEffect(() => setGl(hasWebGL()), []);
  if (gl === null) return null;
  if (gl) return <Tree3D {...props} />;
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4">
      <Tree2D rootCa={props.rootCa} width={220} height={160} highlightCa={props.focusCa} onSelect={props.onSelect} live />
    </div>
  );
}
