export const polygonShapePoints = (shape) => {
  if (shape !== 'hexagon' && shape !== 'star') return null
  const count = shape === 'star' ? 10 : 6
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / count
    const radius = shape === 'star' && index % 2 ? 21 : 50
    return { x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius }
  })
}
