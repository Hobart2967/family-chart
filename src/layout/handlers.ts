import * as d3 from "d3"
import { TreeDatum } from "../types/treeData"
import { Data, Datum } from "../types/data"
import { CalculateTreeOptions } from "./calculate-tree"

export function sortChildrenWithSpouses(children: Datum[], datum: Datum, data: Data) {
  if (!datum.rels.children) return
  const spouses = datum.rels.spouses || []
  return children.sort((a, b) => {
    const a_p2 = otherParent(a, datum, data)
    const b_p2 = otherParent(b, datum, data)
    const a_i = a_p2 ? spouses.indexOf(a_p2.id) : -1
    const b_i = b_p2 ? spouses.indexOf(b_p2.id) : -1

    if (datum.data.gender === "M") return a_i - b_i
    else return b_i - a_i
  })
}

export function sortAddNewChildren(children: Datum[]) {
  return children.sort((a, b) => {
    const a_new = a._new_rel_data
    const b_new = b._new_rel_data
    if (a_new && !b_new) return 1
    if (!a_new && b_new) return -1
    return 0
  })
}

function otherParent(d: Datum, p1: Datum, data: Data) {
  return data.find(d0 => (d0.id !== p1.id) && (d.rels.parents.includes(d0.id)))
}

export function calculateEnterAndExitPositions(d: TreeDatum, entering: boolean, exiting: boolean) {
  d.exiting = exiting
  if (entering) {
    if (d.depth === 0 && !d.spouse) {d._x = d.x; d._y = d.y}
    else if (d.spouse) {d._x = d.spouse.x; d._y = d.spouse.y;}
    else if (d.is_ancestry) {
      // For ancestry nodes, use parent if available, otherwise use first parent from parents array
      if (d.parent) {
        d._x = d.parent.x; d._y = d.parent.y;
      } else if (d.parents && d.parents.length > 0) {
        d._x = d.parents[0].x; d._y = d.parents[0].y;
      } else if (d.sibling) {
        // Sibling without parent in tree - just use current position
        d._x = d.x; d._y = d.y;
      } else {
        throw new Error('no parent')
      }
    }
    else {d._x = d.psx; d._y = d.psy;}
  } else if (exiting) {
    const x = d.x > 0 ? 1 : -1,
      y = d.y > 0 ? 1 : -1
    {d._x = d.x+400*x; d._y = d.y+400*y;}
  }
}

export function setupSiblings({
  tree, data_stash, node_separation, sortChildrenFunction
}: {
  tree: TreeDatum[],
  data_stash: Data,
  node_separation: number,
  sortChildrenFunction: CalculateTreeOptions['sortChildrenFunction']
}) {
  const main = tree.find(d => d.data.main)
  if (!main) throw new Error('no main')
  const p1 = main.data.rels.parents[0]
  const p2 = main.data.rels.parents[1]

  const siblings = findSiblings(main)
  if (siblings.length > 0 && !main.parents) throw new Error('no parents')
  const siblings_added = addSiblingsToTree(main)
  positionSiblings(main)


  function findSiblings(main: TreeDatum) {
    return data_stash.filter(d => {
      if (d.id === main.data.id) return false
      if (p1 && d.rels.parents.includes(p1)) return true
      if (p2 && d.rels.parents.includes(p2)) return true
      return false
    })
  }


  function addSiblingsToTree(main: TreeDatum) {
    const siblings_added = []

    for (let i = 0; i < siblings.length; i++) {
      const sib: TreeDatum = {
        data: siblings[i],
        sibling: true,
        x: 0.0,  // to be calculated in positionSiblings
        y: main.y,
        depth: main.depth-1,
        parents: []
      }

      const p1 = main.parents!.find(d => d.data.id === sib.data.rels.parents[0])
      const p2 = main.parents!.find(d => d.data.id === sib.data.rels.parents[1])
      if (p1) sib.parents!.push(p1)
      if (p2) sib.parents!.push(p2)

      tree.push(sib)
      siblings_added.push(sib)
    }

    return siblings_added
  }

  function positionSiblings(main: TreeDatum) {
    const sorted_siblings = [main, ...siblings_added]
    if (sortChildrenFunction) sorted_siblings.sort((a, b) => sortChildrenFunction(a.data, b.data))  // first sort by custom function if provided

    sorted_siblings.sort((a, b) => {
      const a_p1 = main.parents!.find(d => d.data.id === a.data.rels.parents[0])
      const a_p2 = main.parents!.find(d => d.data.id === a.data.rels.parents[1])
      const b_p1 = main.parents!.find(d => d.data.id === b.data.rels.parents[0])
      const b_p2 = main.parents!.find(d => d.data.id === b.data.rels.parents[1])

      if (!a_p2 && b_p2) return -1
      if (a_p2 && !b_p2) return 1
      if (!a_p1 && b_p1) return 1
      if (a_p1 && !b_p1) return -1
      // If both have same parents or both missing same parent, maintain original order
      return 0
    })

    const main_x = main.x
    const spouses_x = (main.spouses || []).map(d => d.x)
    const x_range = d3.extent([main_x, ...spouses_x])

    const main_sorted_index = sorted_siblings.findIndex(d => d.data.id === main.data.id)
    for (let i = 0; i < sorted_siblings.length; i++) {
      if (i === main_sorted_index) continue
      const sib = sorted_siblings[i]
      if (i < main_sorted_index) {
        sib.x = (x_range[0] ?? 0) - node_separation*(main_sorted_index - i)
      } else {
        sib.x = (x_range[1] ?? 0) + node_separation*(i - main_sorted_index)
      }
    }
  }
}

/**
 * Add all siblings throughout the tree, not just the main person's siblings.
 * This ensures that all persons who share parents are displayed together,
 * regardless of their position in the tree hierarchy.
 */
export function setupAllSiblings({
  tree, data_stash, node_separation, sortChildrenFunction
}: {
  tree: TreeDatum[],
  data_stash: Data,
  node_separation: number,
  sortChildrenFunction: CalculateTreeOptions['sortChildrenFunction']
}) {
  // Find all persons in the tree who have parents in the data (including ancestry nodes)
  // and whose siblings aren't in the tree yet
  const nodes_with_parents = tree.filter(d =>
    !d.added &&
    !d.sibling &&
    d.data.rels.parents &&
    d.data.rels.parents.length > 0
  )

  console.log('setupAllSiblings - nodes_with_parents:', nodes_with_parents.length,
    nodes_with_parents.map(n => ({ id: n.data.id, name: n.data.data?.['first name'], is_ancestry: n.is_ancestry, parents: n.data.rels.parents })))

  nodes_with_parents.forEach(node => {
    const parent_ids = node.data.rels.parents

    // Find siblings - people who share at least one parent
    const siblings = data_stash.filter(d => {
      if (d.id === node.data.id) return false // not the node itself
      if (tree.find(t => t.data.id === d.id && !t.added)) return false // already in tree (not as spouse)

      // Check if shares at least one parent
      return parent_ids.some(p_id => d.rels.parents.includes(p_id))
    })

    console.log(`Node ${node.data.id} (${node.data.data?.['first name']}) has ${siblings.length} siblings:`,
      siblings.map(s => ({ id: s.id, name: s.data?.['first name'], parents: s.rels.parents })))

    if (siblings.length === 0) return

    // Check if parent nodes are in the tree (for positioning and linking)
    const parent_nodes = tree.filter(p => parent_ids.includes(p.data.id))

    // Add siblings to tree
    siblings.forEach(siblingData => {
      const sib_parents = parent_nodes.filter(p => siblingData.rels.parents.includes(p.data.id))

      const sib: TreeDatum = {
        data: siblingData,
        sibling: true,
        x: 0.0,  // to be calculated later
        y: node.y,
        depth: node.depth,
        is_ancestry: node.is_ancestry,  // inherit ancestry status from sibling node
        parents: sib_parents.length > 0 ? sib_parents : undefined
      }

      console.log(`Adding sibling ${siblingData.id} (${siblingData.data?.['first name']}) to tree`)
      tree.push(sib)
    })
  })

  // Position all siblings
  positionAllSiblings(tree, node_separation, sortChildrenFunction)
}

function positionAllSiblings(tree: TreeDatum[], node_separation: number, sortChildrenFunction: CalculateTreeOptions['sortChildrenFunction']) {
  // Group nodes by depth and parent sets
  const grouped = new Map<string, TreeDatum[]>()

  tree.forEach(node => {
    if (node.added) return // skip spouses
    if (!node.data.rels.parents || node.data.rels.parents.length === 0) return // skip root nodes

    const parent_key = [...node.data.rels.parents].sort().join('-')
    const key = `${node.depth}-${parent_key}`

    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(node)
  })

  // Get all occupied x positions at each depth (including spouses and coparents) to avoid collisions
  // We need to check for positions within node_separation/2 to avoid visual overlap
  const isPositionOccupied = (occupied: Set<number>, x: number, node_separation: number): boolean => {
    // Check if any occupied position is within node_separation/2 of x
    // This prevents placing nodes too close together (even on opposite sides)
    const threshold = node_separation * 0.6  // Need enough space to avoid overlap
    for (const occupied_x of occupied) {
      if (Math.abs(occupied_x - x) < threshold) {
        return true
      }
    }
    return false
  }

  // Helper function to find the next unoccupied position by skipping past clusters
  // This avoids stepping through densely packed areas one position at a time
  const findNextGap = (occupied: Set<number>, start_x: number, direction: 'left' | 'right', node_separation: number): number => {
    const threshold = node_separation * 0.6
    const sorted = Array.from(occupied).sort((a, b) => a - b)

    if (direction === 'left') {
      // Moving left (decreasing x), find the first position that would collide
      let blocking_idx = -1
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (sorted[i] < start_x && start_x - sorted[i] < threshold + node_separation) {
          blocking_idx = i
          break
        }
      }

      if (blocking_idx === -1) return start_x - node_separation // No collision - move one step

      // Find the leftmost position in the cluster (consecutive positions within threshold)
      let leftmost_idx = blocking_idx
      for (let i = blocking_idx - 1; i >= 0; i--) {
        if (sorted[leftmost_idx] - sorted[i] < node_separation + threshold) {
          leftmost_idx = i
        } else {
          break // Gap found, cluster ends
        }
      }

      return sorted[leftmost_idx] - node_separation
    } else {
      // Moving right (increasing x), find the first position that would collide
      let blocking_idx = -1
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i] > start_x && sorted[i] - start_x < threshold + node_separation) {
          blocking_idx = i
          break
        }
      }

      if (blocking_idx === -1) return start_x + node_separation // No collision - move one step

      // Find the rightmost position in the cluster (consecutive positions within threshold)
      let rightmost_idx = blocking_idx
      for (let i = blocking_idx + 1; i < sorted.length; i++) {
        if (sorted[i] - sorted[rightmost_idx] < node_separation + threshold) {
          rightmost_idx = i
        } else {
          break // Gap found, cluster ends
        }
      }

      return sorted[rightmost_idx] + node_separation
    }
  }

  const occupiedByDepth = new Map<number, Set<number>>()
  tree.forEach(node => {
    if (!occupiedByDepth.has(node.depth)) occupiedByDepth.set(node.depth, new Set())
    occupiedByDepth.get(node.depth)!.add(node.x)  // Store exact positions
    if (node.spouses) {
      node.spouses.forEach(sp => occupiedByDepth.get(node.depth)!.add(sp.x))
    }
    if (node.coparent) {
      occupiedByDepth.get(node.depth)!.add(node.coparent.x)
    }
  })

  // For each group, position siblings around their center
  grouped.forEach((siblings, key) => {
    if (siblings.length <= 1) return // no need to reposition single nodes

    // Sort siblings
    if (sortChildrenFunction) {
      siblings.sort((a, b) => sortChildrenFunction(a.data, b.data))
    }

    console.log(`\n=== Positioning sibling group with ${siblings.length} members ===`)
    console.log(`Siblings:`, siblings.map(s => ({
      id: s.data.id,
      x: s.x,
      sibling: s.sibling,
      spouses: s.spouses?.length || 0
    })))

    // Find the existing node (non-sibling) that's already positioned
    const non_sibling = siblings.find(s => !s.sibling)
    if (!non_sibling) {
      // All are siblings - position them in a row
      siblings.forEach((sib, i) => {
        sib.x = i * node_separation
      })
      console.log('All siblings - positioned in row')
      return
    }

    const depth = non_sibling.depth
    const occupied = occupiedByDepth.get(depth)!

    console.log(`Depth ${depth} occupied positions BEFORE:`, Array.from(occupied).sort((a, b) => a - b))

    // Calculate the center position of the parents to keep siblings near their family group
    let parent_center_x = non_sibling.x // fallback if no parents
    if (non_sibling.parents && non_sibling.parents.length > 0) {
      const parent_x_positions = non_sibling.parents.map(p => p.x)
      parent_center_x = parent_x_positions.reduce((sum, x) => sum + x, 0) / parent_x_positions.length
      console.log(`Parents at x positions: [${parent_x_positions.join(', ')}], center: ${parent_center_x}`)
    }

    // Get all x positions occupied by this node and its spouses/coparent
    const spouses_x = (non_sibling.spouses || []).map(d => d.x)
    const all_x_positions = [non_sibling.x, ...spouses_x]

    // For ancestry nodes, include coparent if present
    if (non_sibling.coparent) {
      all_x_positions.push(non_sibling.coparent.x)
    }

    const x_range = d3.extent(all_x_positions)
    const min_x = x_range[0] ?? non_sibling.x
    const max_x = x_range[1] ?? non_sibling.x

    console.log(`Non-sibling ${non_sibling.data.id} at x=${non_sibling.x}, spouse/coparent range: [${min_x}, ${max_x}]`)
    console.log(`Parent center: ${parent_center_x}, sibling group should be positioned near this x value`)

    // Helper function to check if a position would intersect with parent-child links from OTHER families
    // Siblings should be allowed to cross their own parents' links since they share the same parents
    // Returns the x position to jump to if there's an intersection, or null if no intersection
    const getJumpPositionForLinkIntersection = (x: number, direction: 'left' | 'right'): number | null => {
      const buffer = node_separation / 4
      const nodes_at_depth = tree.filter(n => n.depth === depth && !n.added && !n.sibling)

      // Get the siblings' shared parent IDs so we can skip those links
      const sibling_parent_ids = new Set<string>()
      if (non_sibling.parents) {
        for (const parent of non_sibling.parents) {
          if (parent && parent.data.id) sibling_parent_ids.add(parent.data.id)
        }
      }

      // Collect parent-child link corridors from OTHER families only
      const corridors: Array<{min: number, max: number, desc: string}> = []

      for (const node of nodes_at_depth) {
        // Skip the non-sibling itself - siblings can position near their own family
        if (node.data.id === non_sibling.data.id) continue

        // Check parent links (upward) - only if these are NOT the siblings' parents
        if (node.parents) {
          for (const parent of node.parents) {
            if (!parent || !parent.data.id) continue
            // Skip if this is one of the siblings' parents
            if (sibling_parent_ids.has(parent.data.id)) continue

            const link_min = Math.min(parent.x, node.x)
            const link_max = Math.max(parent.x, node.x)
            corridors.push({
              min: link_min - buffer,
              max: link_max + buffer,
              desc: `${parent.data.id.substring(0,8)}->${node.data.id?.substring(0,8)}`
            })
          }
        }

        // Check children links (downward) - these are never the siblings' links
        if (node.children) {
          for (const child of node.children) {
            if (!child) continue
            const link_min = Math.min(child.x, node.x)
            const link_max = Math.max(child.x, node.x)
            corridors.push({
              min: link_min - buffer,
              max: link_max + buffer,
              desc: `${node.data.id?.substring(0,8)}->${child.data.id?.substring(0,8)}`
            })
          }
        }
      }

      // Check if x intersects with any corridor
      for (const corridor of corridors) {
        if (x > corridor.min && x < corridor.max) {
          // Jump to just past the corridor in the direction we're moving
          const jump_to = direction === 'left' ? corridor.min - node_separation : corridor.max + node_separation
          console.log(`  LINK INTERSECTION: x=${x} in corridor [${corridor.min}, ${corridor.max}] (${corridor.desc}), jumping to ${jump_to}`)
          return jump_to
        }
      }

      return null
    }

    // Strategy: Position siblings on BOTH sides of the non-sibling to keep family compact
    // Use alternating distribution to balance left/right and avoid cascading far away
    const total_siblings = siblings.length
    const sibling_count = total_siblings - 1 // excluding non-sibling

    console.log(`Positioning ${total_siblings} siblings (${sibling_count} new) near non-sibling at x=${non_sibling.x}, parent center: ${parent_center_x}`)

    // Get all occupied positions at this depth to analyze available space
    const depth_occupied = Array.from(occupied).sort((a, b) => a - b)

    // Determine which side of the non-sibling has more available space
    // Find the nearest occupied position on each side
    const occupied_on_left = depth_occupied.filter(x => x < non_sibling.x)
    const occupied_on_right = depth_occupied.filter(x => x > non_sibling.x)

    const nearest_left = occupied_on_left.length > 0 ? occupied_on_left[occupied_on_left.length - 1] : -Infinity
    const nearest_right = occupied_on_right.length > 0 ? occupied_on_right[0] : Infinity

    const space_on_left = non_sibling.x - nearest_left
    const space_on_right = nearest_right - non_sibling.x

    console.log(`  Space analysis: left=${space_on_left.toFixed(1)}, right=${space_on_right.toFixed(1)}`)

    // All siblings (except non-sibling) should be placed together on ONE side
    const all_new_siblings = siblings.filter(s => s !== non_sibling)
    const needed_space = all_new_siblings.length * node_separation

    // Determine which side has spouses/coparent
    const has_left_spouse = spouses_x.some(sx => sx < non_sibling.x) ||
                           (non_sibling.coparent && non_sibling.coparent.x < non_sibling.x)
    const has_right_spouse = spouses_x.some(sx => sx > non_sibling.x) ||
                            (non_sibling.coparent && non_sibling.coparent.x > non_sibling.x)

    console.log(`  Spouse analysis: left=${has_left_spouse}, right=${has_right_spouse}`)

    // PRIMARY RULE: Place siblings on the side WITHOUT spouses
    // SECONDARY RULE: If both sides have spouses or neither has spouses, reserve space and widen tree
    let place_on_left: boolean

    if (has_left_spouse && !has_right_spouse) {
      // Spouse on left, place siblings on right
      place_on_left = false
      console.log(`  Placing on right (no spouse on that side)`)
    } else if (!has_left_spouse && has_right_spouse) {
      // Spouse on right, place siblings on left
      place_on_left = true
      console.log(`  Placing on left (no spouse on that side)`)
    } else {
      // Both sides have spouses or neither has spouses
      // Place towards parent center to keep family group compact
      place_on_left = parent_center_x < non_sibling.x
      console.log(`  No clear spouse preference, placing towards parent (${place_on_left ? 'left' : 'right'})`)
    }

    // Assign siblings to single group on chosen side
    const sibling_group = all_new_siblings

    console.log(`  Placing ${sibling_group.length} siblings on ${place_on_left ? 'left' : 'right'} side of non-sibling`)

    // Calculate starting position for the group
    // Position siblings adjacent to the non-sibling, extending in the chosen direction
    let group_start_x: number
    if (place_on_left) {
      // Place siblings to the left, starting from (non_sibling.x - needed_space)
      group_start_x = non_sibling.x - needed_space
    } else {
      // Place siblings to the right, starting from (non_sibling.x + node_separation)
      group_start_x = non_sibling.x + node_separation
    }

    console.log(`  Initial group start: ${group_start_x.toFixed(1)}`)

    // === PHASE 15: UNIFIED GROUP GAP FINDING ===
    // Find ONE contiguous gap that can fit the ENTIRE sibling group together
    // This prevents splitting siblings across distant regions of the tree
    const total_group_width = needed_space

    // Build corridor map
    const buffer = node_separation / 4
    type Corridor = { min: number, max: number }
    const all_corridors: Corridor[] = []

    const nodes_at_depth = tree.filter(n => n.depth === depth && !n.added && !n.sibling)
    for (const node of nodes_at_depth) {
      if (node.parents) {
        for (const parent of node.parents) {
          if (!parent) continue
          const link_min = Math.min(parent.x, node.x)
          const link_max = Math.max(parent.x, node.x)
          all_corridors.push({ min: link_min - buffer, max: link_max + buffer })
        }
      }

      if (node.children) {
        for (const child of node.children) {
          if (!child) continue
          const link_min = Math.min(child.x, node.x)
          const link_max = Math.max(child.x, node.x)
          all_corridors.push({ min: link_min - buffer, max: link_max + buffer })
        }
      }
    }

    // Merge overlapping corridors
    if (all_corridors.length > 0) {
      all_corridors.sort((a, b) => a.min - b.min)
      const merged_corridors: Corridor[] = [all_corridors[0]]

      for (let i = 1; i < all_corridors.length; i++) {
        const current = all_corridors[i]
        const last_merged = merged_corridors[merged_corridors.length - 1]

        if (current.min <= last_merged.max + node_separation) {
          last_merged.max = Math.max(last_merged.max, current.max)
        } else {
          merged_corridors.push(current)
        }
      }

      // Identify gaps between corridors
      type Gap = { start: number, end: number, size: number, center: number, distFromParent: number }
      const gaps: Gap[] = []

      // Gap before first corridor (limited to reasonable range)
      if (merged_corridors.length > 0) {
        const first_gap_end = merged_corridors[0].min
        const reasonable_left = parent_center_x - node_separation * 20
        const first_gap_start = Math.max(first_gap_end - 50000, reasonable_left)
        if (first_gap_end > first_gap_start) {
          const center = (first_gap_start + first_gap_end) / 2
          gaps.push({
            start: first_gap_start,
            end: first_gap_end,
            size: first_gap_end - first_gap_start,
            center,
            distFromParent: Math.abs(center - parent_center_x)
          })
        }
      }

      // Gaps between corridors
      for (let i = 0; i < merged_corridors.length - 1; i++) {
        const gap_start = merged_corridors[i].max
        const gap_end = merged_corridors[i + 1].min
        const gap_size = gap_end - gap_start

        if (gap_size > 0) {
          const center = (gap_start + gap_end) / 2
          gaps.push({
            start: gap_start,
            end: gap_end,
            size: gap_size,
            center,
            distFromParent: Math.abs(center - parent_center_x)
          })
        }
      }

      // Gap after last corridor (limited to reasonable range)
      if (merged_corridors.length > 0) {
        const last_gap_start = merged_corridors[merged_corridors.length - 1].max
        const reasonable_right = parent_center_x + node_separation * 20
        const last_gap_end = Math.min(last_gap_start + 50000, reasonable_right)
        if (last_gap_end > last_gap_start) {
          const center = (last_gap_start + last_gap_end) / 2
          gaps.push({
            start: last_gap_start,
            end: last_gap_end,
            size: last_gap_end - last_gap_start,
            center,
            distFromParent: Math.abs(center - parent_center_x)
          })
        }
      }

      // Find ONE gap that fits the ENTIRE group
      const adequate_gaps = gaps.filter(g => g.size >= total_group_width)

      if (adequate_gaps.length > 0) {
        // Perfect gap found - use it, preferring gaps closer to the non-sibling
        // Sort by distance from non-sibling (not parent) to keep family together
        adequate_gaps.sort((a, b) => {
          const distA = Math.abs(a.center - non_sibling.x)
          const distB = Math.abs(b.center - non_sibling.x)
          return distA - distB
        })
        const best_gap = adequate_gaps[0]

        // Position group within the gap, centered
        const gap_group_start = best_gap.center - total_group_width / 2

        // Override with gap-based position if it's reasonable
        if (Math.abs(gap_group_start - group_start_x) < node_separation * 5) {
          group_start_x = gap_group_start
        }

        console.log(`  Using unified gap at ${best_gap.center.toFixed(1)} (size: ${best_gap.size.toFixed(1)}, dist from non-sibling: ${Math.abs(best_gap.center - non_sibling.x).toFixed(1)}), group from ${group_start_x.toFixed(1)}`)
      } else {
        // No perfect gap - position around the non-sibling directly
        // Keep the calculated group_start_x
        console.log(`  No adequate gap found, positioning directly adjacent to non-sibling`)
      }
    } else {
      // No corridors
      console.log(`  No corridors to avoid, using direct positioning`)
    }

    // Position all siblings as a single continuous group
    const sibling_positions: number[] = []
    let current_x = group_start_x

    for (let i = 0; i < sibling_group.length; i++) {
      sibling_positions.push(current_x)
      current_x += node_separation
    }

    // Check if ANY position would collide
    const has_collision = sibling_positions.some(pos =>
      isPositionOccupied(occupied, pos, node_separation)
    )

    if (has_collision) {
      console.log(`  Group has collision, need to widen tree on ${place_on_left ? 'left' : 'right'} side...`)

      // Calculate how much space we need
      const needed_width = sibling_group.length * node_separation

      // Find all nodes at this depth that need to be shifted
      const nodes_at_depth = tree.filter(n => n.depth === depth && n.data.id !== non_sibling.data.id)

      if (place_on_left) {
        // Place siblings to the left, shift everything left of non-sibling further left
        const shift_amount = needed_width

        // Find nodes that are on the left side and need shifting
        const nodes_to_shift = nodes_at_depth.filter(n => n.x < non_sibling.x)

        if (nodes_to_shift.length > 0) {
          console.log(`  Shifting ${nodes_to_shift.length} nodes left by ${shift_amount.toFixed(1)}`)

          nodes_to_shift.forEach(n => {
            const old_x = n.x
            n.x -= shift_amount

            // Update occupied set
            occupied.delete(old_x)
            occupied.add(n.x)

            // Also shift spouses if any
            if (n.spouses) {
              n.spouses.forEach(sp => {
                if (sp.x < non_sibling.x) {
                  const old_sp_x = sp.x
                  sp.x -= shift_amount
                  occupied.delete(old_sp_x)
                  occupied.add(sp.x)
                }
              })
            }

            // Also shift coparent if any
            if (n.coparent && n.coparent.x < non_sibling.x) {
              const old_cp_x = n.coparent.x
              n.coparent.x -= shift_amount
              occupied.delete(old_cp_x)
              occupied.add(n.coparent.x)
            }

            console.log(`    Shifted node ${n.data.id} from ${old_x.toFixed(1)} to ${n.x.toFixed(1)}`)
          })

          // Recalculate starting position after shift
          group_start_x = non_sibling.x - needed_width
        }

      } else {
        // Place siblings to the right, shift everything right of non-sibling further right
        const shift_amount = needed_width

        // Find nodes that are on the right side and need shifting
        const nodes_to_shift = nodes_at_depth.filter(n => n.x > non_sibling.x)

        if (nodes_to_shift.length > 0) {
          console.log(`  Shifting ${nodes_to_shift.length} nodes right by ${shift_amount.toFixed(1)}`)

          nodes_to_shift.forEach(n => {
            const old_x = n.x
            n.x += shift_amount

            // Update occupied set
            occupied.delete(old_x)
            occupied.add(n.x)

            // Also shift spouses if any
            if (n.spouses) {
              n.spouses.forEach(sp => {
                if (sp.x > non_sibling.x) {
                  const old_sp_x = sp.x
                  sp.x += shift_amount
                  occupied.delete(old_sp_x)
                  occupied.add(sp.x)
                }
              })
            }

            // Also shift coparent if any
            if (n.coparent && n.coparent.x > non_sibling.x) {
              const old_cp_x = n.coparent.x
              n.coparent.x += shift_amount
              occupied.delete(old_cp_x)
              occupied.add(n.coparent.x)
            }

            console.log(`    Shifted node ${n.data.id} from ${old_x.toFixed(1)} to ${n.x.toFixed(1)}`)
          })

          // Starting position stays the same since we shifted right nodes
          group_start_x = non_sibling.x + node_separation
        }
      }

      // Recalculate sibling positions in the newly created space
      sibling_positions.length = 0
      let pos_x = group_start_x
      for (let i = 0; i < sibling_group.length; i++) {
        sibling_positions.push(pos_x)
        pos_x += node_separation
      }

      console.log(`  Siblings will be placed from ${group_start_x.toFixed(1)} to ${(group_start_x + needed_width).toFixed(1)}`)
    }

    // Assign final positions
    for (let i = 0; i < sibling_group.length; i++) {
      const sib = sibling_group[i]
      sib.x = sibling_positions[i]
      occupied.add(sib.x)
      console.log(`  Sibling ${sib.data.id} → x=${sib.x}`)
    }

    console.log(`Depth ${non_sibling.depth} occupied positions AFTER:`, Array.from(occupied).sort((a, b) => a - b))
  })
}

export function handlePrivateCards({
  tree,
  data_stash,
  private_cards_config
}: {
  tree: TreeDatum[],
  data_stash: Data,
  private_cards_config: {
    condition: (d: Datum) => boolean;
  }
}) {
  const private_persons: Record<Datum['id'], boolean> = {}
  const condition = private_cards_config.condition
  if (!condition) return console.error('private_cards_config.condition is not set')
  tree.forEach(d => {
    if (d.data._new_rel_data) return
    const is_private = isPrivate(d.data.id)
    if (is_private) d.is_private = is_private
    return
  })

  function isPrivate(d_id: Datum['id']) {
    const parents_and_spouses_checked: Datum['id'][] = []
    let is_private = false
    checkParentsAndSpouses(d_id)
    private_persons[d_id] = is_private
    return is_private

    function checkParentsAndSpouses(d_id: Datum['id']) {
      if (is_private) return
      if (private_persons.hasOwnProperty(d_id)) {
        is_private = private_persons[d_id]
        return is_private
      }
      const d = data_stash.find(d0 => d0.id === d_id)
      if (!d) throw new Error('no d')
      if (d._new_rel_data) return
      if (condition(d)) {
        is_private = true
        return true
      }

      const rels = d.rels;
      [...rels.parents, ...(rels.spouses || [])].forEach(d0_id => {
        if (!d0_id) return
        if (parents_and_spouses_checked.includes(d0_id)) return
        parents_and_spouses_checked.push(d0_id)
        checkParentsAndSpouses(d0_id)
      })
    }
  }
}

export function getMaxDepth(d_id: Datum['id'], data_stash: Data) {
  const datum = data_stash.find(d => d.id === d_id)
  if (!datum) throw new Error('no datum')
  const root_ancestry = d3.hierarchy(datum, d => hierarchyGetterParents(d) as Iterable<Datum>)
  const root_progeny = d3.hierarchy(datum, d => hierarchyGetterChildren(d) as Iterable<Datum>)

  return {
    ancestry: root_ancestry.height,
    progeny: root_progeny.height
  }


  function hierarchyGetterChildren(d: Datum) {
    return [...(d.rels.children || [])]
      .map(id => data_stash.find(d => d.id === id))
      .filter(d => d && !d._new_rel_data && !d.to_add)
  }

  function hierarchyGetterParents(d: Datum) {
    return d.rels.parents
      .filter(d => d)
      .map(id => data_stash.find(d => d.id === id))
      .filter(d => d && !d._new_rel_data && !d.to_add)
  }
}