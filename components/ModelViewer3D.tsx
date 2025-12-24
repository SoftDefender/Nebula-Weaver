
import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VertexNormalsHelper } from 'three/examples/jsm/helpers/VertexNormalsHelper.js';
import { ViewerConfig, ModelStudioItem } from '../types';

interface ModelViewer3DProps {
  layers: ModelStudioItem[];
  layerObjects: Map<string, THREE.Group>;
  config: ViewerConfig;
}

const ModelViewer3D: React.FC<ModelViewer3DProps> = ({ layers, layerObjects, config }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const helpersRef = useRef<{ 
    grid: THREE.GridHelper, 
    axes: THREE.AxesHelper,
    normals: THREE.Group 
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(config.isProMode ? 0x050505 : 0xf4f6f8);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      45,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.01,
      5000
    );
    camera.position.set(5, 5, 5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    // --- Lights ---
    const ambientLight = new THREE.AmbientLight(0xffffff, config.isProMode ? 0.2 : 0.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 7.5);
    dirLight.castShadow = true;
    scene.add(dirLight);

    if (config.isProMode) {
      const pointLight = new THREE.PointLight(0x3b82f6, 2, 50);
      pointLight.position.set(-5, 5, -5);
      scene.add(pointLight);
    }

    // --- Helpers ---
    const grid = new THREE.GridHelper(10, 10, 0x444444, 0x222222);
    scene.add(grid);

    const axes = new THREE.AxesHelper(1);
    scene.add(axes);

    const normalsGroup = new THREE.Group();
    scene.add(normalsGroup);

    helpersRef.current = { grid, axes, normals: normalsGroup };

    // --- Animation Loop ---
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current || !camera || !renderer) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      renderer.dispose();
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update scene based on layers
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clean dynamic objects (keeping lights and helpers)
    scene.children.forEach(child => {
      if (child.userData.isLayer) {
        scene.remove(child);
      }
    });

    helpersRef.current?.normals.clear();

    layers.forEach(layer => {
      const obj = layerObjects.get(layer.id);
      if (obj && layer.status === 'success') {
        obj.userData.isLayer = true;
        obj.visible = layer.properties.visible;
        
        // Apply transforms
        obj.position.set(layer.properties.position.x, layer.properties.position.y, layer.properties.position.z);
        obj.scale.set(layer.properties.scale.x, layer.properties.scale.y, layer.properties.scale.z);

        // Apply material properties
        obj.traverse(child => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            const mat = mesh.material as THREE.MeshStandardMaterial;
            mat.wireframe = config.wireframe;
            mat.transparent = layer.properties.opacity < 1.0;
            mat.opacity = layer.properties.opacity;
            mat.color.set(layer.properties.color);
            
            // Pro Mode: Normals
            if (config.isProMode && config.showNormals) {
              const normalHelper = new VertexNormalsHelper(mesh, 0.1, 0x00ff00);
              helpersRef.current?.normals.add(normalHelper);
            }
          }
        });

        // Parenting logic (Binding)
        if (layer.properties.parentId) {
          const parentObj = layerObjects.get(layer.properties.parentId);
          if (parentObj) {
            parentObj.add(obj);
          } else {
            scene.add(obj);
          }
        } else {
          scene.add(obj);
        }
      }
    });

    if (scene.background instanceof THREE.Color) {
      scene.background.set(config.isProMode ? 0x050505 : 0xf4f6f8);
    }

  }, [layers, layerObjects, config]);

  useEffect(() => {
    if (helpersRef.current) {
      helpersRef.current.grid.visible = config.showGrid;
      helpersRef.current.axes.visible = config.showAxes;
    }
    if (rendererRef.current) {
      rendererRef.current.toneMappingExposure = config.exposure;
    }
    if (controlsRef.current) {
      controlsRef.current.autoRotate = config.autoRotate;
    }
  }, [config]);

  return <div ref={containerRef} className="w-full h-full" />;
};

export default ModelViewer3D;
