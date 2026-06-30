interface Props {
  oldString: string
  newString: string
}

export function DiffView({ oldString, newString }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 text-xs font-mono mt-2">
      <div className="border rounded overflow-hidden">
        <div className="px-2 py-1 bg-red-50 text-red-700 text-xs font-sans font-medium border-b">
          Before
        </div>
        <pre className="px-2 py-2 whitespace-pre-wrap break-words max-h-60 overflow-y-auto bg-red-50/30 text-red-800 leading-relaxed">
          {oldString}
        </pre>
      </div>
      <div className="border rounded overflow-hidden">
        <div className="px-2 py-1 bg-green-50 text-green-700 text-xs font-sans font-medium border-b">
          After
        </div>
        <pre className="px-2 py-2 whitespace-pre-wrap break-words max-h-60 overflow-y-auto bg-green-50/30 text-green-800 leading-relaxed">
          {newString}
        </pre>
      </div>
    </div>
  )
}
