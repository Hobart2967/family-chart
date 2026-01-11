import { TreeDatum } from "../types/treeData"
import { Tree } from "./calculate-tree"

export interface Link {
  d: [number, number][]
  _d: () => [number, number][]
  curve: boolean
  id: string
  depth: number
  is_ancestry: boolean | undefined
  source: TreeDatum | TreeDatum[]
  target: TreeDatum | TreeDatum[]
  spouse?: boolean
}

type LinkPoint = {x: number, y: number, _x?: number, _y?: number}

export function createLinks(d: TreeDatum, is_horizontal: boolean = false, link_curve: boolean = true) {
  const links: Link[] = [];
  // d.spouses is always added to non-ancestry side for main blodline nodes
  // d.coparent is added to ancestry side
  if (d.spouses || d.coparent) handleSpouse(d)
  handleAncestrySide(d)
  handleProgenySide(d)

  return links;

  function handleAncestrySide(d: TreeDatum) {
    if (!d.parents) return
    const p1 = d.parents[0]
    const p2 = d.parents[1] || p1

    // Calculate offset based on the parent pair to separate different families
    // Use the parent IDs to create a stable hash for each family unit
    const parent_ids = [p1.data.id, p2.data.id].sort().join('-')
    const parent_hash = hashString(parent_ids)
    const offset_factor = (parent_hash % 7) - 3 // Range: -3 to +3

    console.log(`handleAncestrySide for ${d.data.id.substring(0, 8)}: parent_ids=${parent_ids.substring(0, 40)}, hash=${parent_hash}, offset=${offset_factor}`)

    const p = {x: getMid(p1, p2, 'x'), y: getMid(p1, p2, 'y')}

    links.push({
      d: Link(d, p, offset_factor),
      _d: () => {
        const _d = {x: d.x, y: d.y},
          _p = {x: d.x, y: d.y}
        return Link(_d, _p, 0)
      },
      curve: link_curve,
      id: linkId(d, p1, p2),
      depth: d.depth+1,
      is_ancestry: true,
      source: d,
      target: [p1, p2]
    })
  }


  function handleProgenySide(d: TreeDatum) {
    if (!d.children || d.children.length === 0) return

    console.log(`handleProgenySide for ${d.data.id.substring(0, 8)}: ${d.children.length} children`)

    d.children.forEach((child, i) => {
      const other_parent = otherParent(child, d) || d
      const sx = other_parent.sx
      if (typeof sx !== 'number') throw new Error('sx is not a number')

      // Calculate offset based on the parent pair to separate different families
      // Use the parent IDs to create a stable hash for each family unit
      const parent_ids = [d.data.id, other_parent.data.id].sort().join('-')
      const parent_hash = hashString(parent_ids)
      const offset_factor = (parent_hash % 7) - 3 // Range: -3 to +3

      console.log(`  Child ${child.data.id.substring(0, 8)}: parent_ids=${parent_ids.substring(0, 40)}, hash=${parent_hash}, offset=${offset_factor}`)

      const parent_pos: LinkPoint = !is_horizontal ? {x: sx, y: d.y} : {x: d.x, y: sx}
      links.push({
        d: Link(child, parent_pos, offset_factor),
        _d: () => Link(parent_pos, {x: _or(parent_pos, 'x'), y: _or(parent_pos, 'y')}, 0),
        curve: link_curve,
        id: linkId(child, d, other_parent),
        depth: d.depth+1,
        is_ancestry: false,
        source: [d, other_parent],
        target: child
      })
    })
  }


  function handleSpouse(d: TreeDatum) {
    if (d.spouses) {
      d.spouses.forEach(spouse => links.push(createSpouseLink(d, spouse)))
    } else if (d.coparent) {
      links.push(createSpouseLink(d, d.coparent))
    }

    function createSpouseLink(d: TreeDatum, spouse: TreeDatum): Link {
      return {
        d: [[d.x, d.y], [spouse.x, spouse.y]],
        _d: () => [
          d.is_ancestry ? [_or(d, 'x')-.0001, _or(d, 'y')] : [d.x, d.y], // add -.0001 to line to have some length if d.x === spouse.x
          d.is_ancestry ? [_or(spouse, 'x'), _or(spouse, 'y')] : [d.x-.0001, d.y]
        ],
        curve: false,
        id: linkId(d, spouse),
        depth: d.depth,
        spouse: true,
        is_ancestry: spouse.is_ancestry,
        source: d,
        target: spouse
      }
    }
  }

  ///
  function getMid(d1: LinkPoint, d2: LinkPoint, side: 'x' | 'y', is_: boolean = false) {
    if (is_) return _or(d1, side) - (_or(d1, side) - _or(d2, side))/2
    else return d1[side] - (d1[side] - d2[side])/2
  }

  function _or(d: LinkPoint, side: 'x' | 'y') {
    const n = d.hasOwnProperty(`_${side}`) ? d[`_${side}`] : d[side]
    if (typeof n !== 'number') throw new Error(`${side} is not a number`)
    return n
  }

  function Link(d: LinkPoint, p: LinkPoint, offset_factor: number = 0): [number, number][] {
    return is_horizontal ? LinkHorizontal(d, p, offset_factor) : LinkVertical(d, p, offset_factor)
  }

  function LinkVertical(d: LinkPoint, p: LinkPoint, offset_factor: number = 0): [number, number][] {
    const hy = (d.y + (p.y - d.y) / 2)
    // Add Y offset to create margin between family group lines
    // For vertical trees, the horizontal connector runs at hy, so offset it vertically
    const line_offset = offset_factor * 50 // 50 pixels per offset unit for clear separation

    return [
      [d.x, d.y],
      [d.x, hy + line_offset],
      [d.x, hy + line_offset],
      [p.x, hy + line_offset],
      [p.x, hy + line_offset],
      [p.x, p.y],
    ]
  }

  function LinkHorizontal(d: LinkPoint, p: LinkPoint, offset_factor: number = 0): [number, number][] {
    const hx = (d.x + (p.x - d.x) / 2)
    // Add X offset to create margin between family group lines
    // For horizontal trees, the vertical connector runs at hx, so offset it horizontally
    const line_offset = offset_factor * 50 // 50 pixels per offset unit for clear separation

    return [
      [d.x, d.y],
      [hx + line_offset, d.y],
      [hx + line_offset, d.y],
      [hx + line_offset, p.y],
      [hx + line_offset, p.y],
      [p.x, p.y],
    ]
  }

  function linkId(...args: TreeDatum[]) {
    return args.map(d => d.tid).sort().join(", ")  // make unique id
  }

  function otherParent(child: TreeDatum, p1: TreeDatum) {
    const p2 = (p1.spouses || []).find(d => child.data.rels.parents.includes(d.data.id))
    return p2
  }

  function hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash)
  }
}



