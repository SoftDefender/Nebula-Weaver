
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { ModelAnalysis, ModelFormat, ModelNode } from '../types';

export const load3DModel = async (url: string, format: ModelFormat): Promise<THREE.Group> => {
  if (format === 'primitive') {
    return createPrimitiveGroup(url);
  }

  return new Promise((resolve, reject) => {
    let loader: any;
    
    switch (format) {
      case 'glb':
      case 'gltf':
        loader = new GLTFLoader();
        loader.load(url, (gltf: any) => resolve(gltf.scene), undefined, reject);
        break;
      case 'obj':
        loader = new OBJLoader();
        loader.load(url, (obj: THREE.Group) => resolve(obj), undefined, reject);
        break;
      case 'stl':
        loader = new STLLoader();
        loader.load(url, (geometry: THREE.BufferGeometry) => {
          const material = new THREE.MeshStandardMaterial({ color: 0x909090 });
          const mesh = new THREE.Mesh(geometry, material);
          const group = new THREE.Group();
          group.add(mesh);
          resolve(group);
        }, undefined, reject);
        break;
      case 'fbx':
        loader = new FBXLoader();
        loader.load(url, (fbx: THREE.Group) => resolve(fbx), undefined, reject);
        break;
      default:
        reject(new Error(`Unsupported format: ${format}`));
    }
  });
};

export const createPrimitiveGroup = async (type: string): Promise<THREE.Group> => {
  let geometry: THREE.BufferGeometry;
  
  switch (type.toLowerCase()) {
    case 'cube':
      geometry = new THREE.BoxGeometry(1, 1, 1);
      break;
    case 'sphere':
      geometry = new THREE.SphereGeometry(0.5, 32, 32);
      break;
    case 'cylinder':
      geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
      break;
    case 'torus':
      geometry = new THREE.TorusGeometry(0.4, 0.1, 16, 100);
      break;
    case 'plane':
      geometry = new THREE.PlaneGeometry(1, 1);
      break;
    case 'cone':
      geometry = new THREE.ConeGeometry(0.5, 1, 32);
      break;
    case 'icosahedron':
      geometry = new THREE.IcosahedronGeometry(0.5, 0);
      break;
    case 'torusknot':
      geometry = new THREE.TorusKnotGeometry(0.3, 0.1, 100, 16);
      break;
    case 'octahedron':
      geometry = new THREE.OctahedronGeometry(0.5, 0);
      break;
    case 'tetrahedron':
      geometry = new THREE.TetrahedronGeometry(0.5, 0);
      break;
    case 'ring':
      geometry = new THREE.RingGeometry(0.2, 0.5, 32);
      break;
    default:
      geometry = new THREE.BoxGeometry(1, 1, 1);
  }

  const material = new THREE.MeshStandardMaterial({ 
    color: 0x3b82f6,
    metalness: 0.5,
    roughness: 0.2
  });
  
  const mesh = new THREE.Mesh(geometry, material);
  const group = new THREE.Group();
  group.add(mesh);
  group.name = `Primitive_${type}`;
  
  return group;
};

export const analyzeModel = (object: THREE.Object3D): ModelAnalysis => {
  let triangles = 0;
  let vertices = 0;
  let meshes = 0;
  let materials = new Set();

  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      meshes++;
      const geometry = (child as THREE.Mesh).geometry;
      if (geometry.index) {
        triangles += geometry.index.count / 3;
      } else {
        triangles += geometry.attributes.position.count / 3;
      }
      vertices += geometry.attributes.position.count;
      
      const material = (child as THREE.Mesh).material;
      if (Array.isArray(material)) {
        material.forEach(m => materials.add(m.uuid));
      } else {
        materials.add(material.uuid);
      }
    }
  });

  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);

  return {
    triangles: Math.round(triangles),
    vertices,
    meshes,
    materials: materials.size,
    dimensions: { x: size.x, y: size.y, z: size.z }
  };
};

export const buildSceneTree = (object: THREE.Object3D): ModelNode[] => {
  const processNode = (obj: THREE.Object3D): ModelNode => {
    const node: ModelNode = {
      id: obj.uuid,
      name: obj.name || obj.type,
      type: (obj as THREE.Mesh).isMesh ? 'mesh' : 'group',
      visible: obj.visible,
    };
    
    if (obj.children.length > 0) {
      node.children = obj.children.map(child => processNode(child));
    }
    
    return node;
  };

  return [processNode(object)];
};

// --- Workflow Atomic Actions ---

export const autoCenterModel = (object: THREE.Object3D) => {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.y -= center.y;
  object.position.z -= center.z;
};

export const normalizeModelScale = (object: THREE.Object3D, targetSize: number = 1.0) => {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = targetSize / maxDim;
  object.scale.set(scale, scale, scale);
};

export const toggleModelWireframe = (object: THREE.Object3D, enabled: boolean) => {
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      ((child as THREE.Mesh).material as THREE.MeshStandardMaterial).wireframe = enabled;
    }
  });
};

export const exportToGLB = async (object: THREE.Object3D): Promise<Blob> => {
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      object,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(new Blob([result], { type: 'model/gltf-binary' }));
        } else {
          const output = JSON.stringify(result, null, 2);
          resolve(new Blob([output], { type: 'model/gltf+json' }));
        }
      },
      (error) => reject(error),
      { binary: true }
    );
  });
};
