/**
 * Rotates a closed cycle [v0, v1, ..., vk-1, v0] so that the lexicographically
 * smallest node is first, ensuring deterministic cycle representation regardless
 * of graph traversal start node.
 */
export function canonicalizeCycle(cycle: string[]): string[] {
  if (cycle.length <= 1) return cycle;
  const nodes = cycle.slice(0, -1);
  if (nodes.length <= 1) return cycle;

  let minIdx = 0;
  for (let i = 1; i < nodes.length; i++) {
    if (nodes[i] < nodes[minIdx]) {
      minIdx = i;
    }
  }

  if (minIdx === 0) {
    return cycle;
  }

  const rotated = [...nodes.slice(minIdx), ...nodes.slice(0, minIdx)];
  return [...rotated, rotated[0]];
}

/**
 * Utility to detect circular dependencies in a directed graph.
 * Returns cycles in canonical, deterministic order.
 */
export function findCircularDependencies(dependencyMap: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const seenCycleKeys = new Set<string>();
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  const addCycle = (rawCycle: string[]) => {
    const canonical = canonicalizeCycle(rawCycle);
    const key = canonical.join(' -> ');
    if (!seenCycleKeys.has(key)) {
      seenCycleKeys.add(key);
      cycles.push(canonical);
    }
  };

  const dfs = (node: string) => {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    const deps = [...(dependencyMap.get(node) || [])].sort();
    for (const neighbor of deps) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recStack.has(neighbor)) {
        // We hit a node currently in the stack (cycle detected)
        const cycleStart = path.indexOf(neighbor);
        addCycle([...path.slice(cycleStart), neighbor]);
      }
    }

    recStack.delete(node);
    path.pop();
  };

  const nodes = [...dependencyMap.keys()].sort();
  for (const node of nodes) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}
