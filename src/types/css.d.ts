// Type declarations for CSS module imports
declare module '*.css' {
  const content: { [className: string]: string }
  export default content
}

// Type declaration for maplibre-gl CSS side-effect import
declare module 'maplibre-gl/dist/maplibre-gl.css'