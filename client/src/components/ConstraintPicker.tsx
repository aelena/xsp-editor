import type { Constraint } from '../api/constraints.ts'

interface ConstraintPickerProps {
  constraints: Constraint[]
  onInsert: (xmlBlock: string) => void
}

function severityBadge(severity: Constraint['severity']) {
  const colors = {
    critical: 'bg-red-100 text-red-800',
    high: 'bg-orange-100 text-orange-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-gray-100 text-gray-800',
  }
  return colors[severity]
}

export default function ConstraintPicker({
  constraints,
  onInsert,
}: ConstraintPickerProps) {
  const activeConstraints = constraints.filter((c) => c.status === 'active')

  if (activeConstraints.length === 0) {
    return (
      <div className="text-sm text-gray-400 p-2">No constraints available.</div>
    )
  }

  return (
    <div data-testid="constraint-picker" className="space-y-1">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2">
        Constraints
      </h4>
      <ul className="space-y-1 max-h-60 overflow-y-auto">
        {activeConstraints.map((constraint) => (
          <li key={constraint.id}>
            <button
              type="button"
              onClick={() => onInsert(constraint.xml_block)}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 text-sm group"
              title={`Insert ${constraint.id}: ${constraint.description}`}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-medium text-gray-700">
                  {constraint.id}
                </span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${severityBadge(constraint.severity)}`}
                >
                  {constraint.severity}
                </span>
              </div>
              <div className="text-xs text-gray-500 truncate mt-0.5">
                {constraint.description}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
