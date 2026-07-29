export const lerpAngle = (a, b, t) => {
  const difference = b - a;
  const shortestAngle =
    ((((difference + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) -
    Math.PI;
  return a + shortestAngle * t;
};
