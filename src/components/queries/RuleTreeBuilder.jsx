import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { X } from 'lucide-react';

// ─── Tree mutation helpers ─────────────────────────────────────────────────────

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function getNodeAtPath(root, path) {
  let node = root;
  for (const key of path) {
    if (!node) return null;
    if (key === 'child') node = node.child;
    else if (node.type === 'group') node = node.children?.[key];
    else return null;
  }
  return node;
}

function updateNodeAtPath(root, path, updaterFn) {
  const next = deepClone(root);
  if (path.length === 0) return updaterFn(next);

  const parentPath = path.slice(0, -1);
  const lastKey = path[path.length - 1];
  const parent = getNodeAtPath(next, parentPath);
  if (!parent) return next;

  if (lastKey === 'child') {
    parent.child = updaterFn(parent.child);
  } else {
    if (!parent.children) return next;
    parent.children[lastKey] = updaterFn(parent.children[lastKey]);
  }
  return next;
}

function removeNodeAtPath(root, path) {
  const next = deepClone(root);
  if (path.length === 0) return next;

  const parentPath = path.slice(0, -1);
  const lastKey = path[path.length - 1];
  const parent = getNodeAtPath(next, parentPath);
  if (!parent) return next;

  if (lastKey === 'child') {
    parent.child = newCond();
  } else if (parent.type === 'group') {
    parent.children.splice(lastKey, 1);
  }
  return next;
}

function addChildAtPath(root, pathToGroup, childNode) {
  const next = deepClone(root);
  const group = getNodeAtPath(next, pathToGroup);
  if (!group || group.type !== 'group') return next;
  group.children = group.children || [];
  group.children.push(childNode);
  return next;
}

export function newCond() {
  return { type: 'cond', field: 'department', operator: '=', value: '' };
}
export function newGroup() {
  return { type: 'group', op: 'AND', children: [newCond()] };
}

// ─── Group colors by depth ─────────────────────────────────────────────────────

const DEPTH_STYLES = [
  'border-blue-300 bg-blue-50/50',
  'border-purple-300 bg-purple-50/50',
  'border-emerald-300 bg-emerald-50/50',
  'border-orange-300 bg-orange-50/50',
];

const OP_BADGE = {
  AND: 'bg-blue-100 text-blue-700 border-blue-300',
  OR:  'bg-purple-100 text-purple-700 border-purple-300',
};

// ─── Main component ────────────────────────────────────────────────────────────

export default function RuleTreeBuilder({ tree, setTree, availableColumns, operatorsByType }) {
  const fieldType = (key) => availableColumns.find(c => c.key === key)?.type || 'text';

  const renderNode = (node, path, depth, isRoot) => {
    if (!node) return null;

    // ── GROUP ──
    if (node.type === 'group') {
      const depthStyle = DEPTH_STYLES[depth % DEPTH_STYLES.length];
      return (
        <div className={`border-2 rounded-xl p-3 space-y-3 ${depthStyle}`}>
          {/* Group header */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Ομάδα</span>
              <Select
                value={node.op}
                onValueChange={(v) => setTree(prev => updateNodeAtPath(prev, path, (n) => ({ ...n, op: v })))}
              >
                <SelectTrigger className={`w-[100px] h-7 text-xs font-bold border ${OP_BADGE[node.op]}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AND">AND</SelectItem>
                  <SelectItem value="OR">OR</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1 flex-wrap">
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
                onClick={() => setTree(prev => addChildAtPath(prev, path, newCond()))}>
                + Συνθήκη
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
                onClick={() => setTree(prev => addChildAtPath(prev, path, newGroup()))}>
                + Υποομάδα
              </Button>
              {!isRoot && (
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600"
                  onClick={() => setTree(prev => removeNodeAtPath(prev, path))}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* Children */}
          <div className="space-y-2">
            {(node.children || []).length === 0 ? (
              <div className="text-sm text-slate-400 italic px-2">Η ομάδα είναι κενή. Προσθέστε συνθήκη.</div>
            ) : (
              node.children.map((child, idx) => (
                <div key={idx}>
                  {renderNode(child, [...path, idx], depth + 1, false)}
                  {/* Between-sibling connector label */}
                  {idx < node.children.length - 1 && (
                    <div className="flex items-center gap-2 my-1 px-2">
                      <div className="h-px flex-1 bg-slate-200" />
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${OP_BADGE[node.op]}`}>
                        {node.op}
                      </span>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    // ── CONDITION ──
    if (node.type === 'cond') {
      const type = fieldType(node.field);
      const ops = operatorsByType[type] || operatorsByType.text;

      return (
        <div className="flex items-center gap-2 flex-wrap bg-white border border-slate-200 rounded-lg px-3 py-2">
          <Select
            value={node.field}
            onValueChange={(v) => {
              const newType = fieldType(v);
              const firstOp = (operatorsByType[newType] || operatorsByType.text)[0].value;
              setTree(prev => updateNodeAtPath(prev, path, (n) => ({
                ...n, field: v, operator: firstOp, value: v === 'voted' ? 'true' : ''
              })));
            }}
          >
            <SelectTrigger className="w-[170px] h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {availableColumns.map(col => (
                <SelectItem key={col.key} value={col.key}>{col.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={node.operator}
            onValueChange={(v) => setTree(prev => updateNodeAtPath(prev, path, (n) => ({ ...n, operator: v })))}
          >
            <SelectTrigger className="w-[120px] h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ops.map(op => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}
            </SelectContent>
          </Select>

          {node.field === 'voted' ? (
            <Select
              value={String(node.value)}
              onValueChange={(v) => setTree(prev => updateNodeAtPath(prev, path, (n) => ({ ...n, value: v })))}
            >
              <SelectTrigger className="flex-1 h-8 text-sm min-w-[80px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Ναι</SelectItem>
                <SelectItem value="false">Όχι</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={node.value ?? ''}
              onChange={(e) => setTree(prev => updateNodeAtPath(prev, path, (n) => ({ ...n, value: e.target.value })))}
              placeholder="Τιμή..."
              className="flex-1 h-8 text-sm min-w-[80px]"
            />
          )}

          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600 shrink-0"
            onClick={() => setTree(prev => removeNodeAtPath(prev, path))}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      );
    }

    return null;
  };

  return renderNode(tree, [], 0, true);
}