import Link from '@tiptap/extension-link'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect } from 'react'
import { ALLOWED_LINK_SCHEMES, isSafeHref } from '../lore/document'

/**
 * ProseMirror builds DOM nodes from the schema rather than parsing HTML, so authored text
 * can never become markup. The one thing that does reach an attribute is a link href, so
 * only safe schemes are accepted; the API refuses the rest as well.
 */
const extensions = [
  StarterKit.configure({ link: false }),
  Link.configure({
    openOnClick: false,
    autolink: false,
    protocols: ALLOWED_LINK_SCHEMES,
    HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
    isAllowedUri: (url) => isSafeHref(url),
  }),
]

function Toolbar({ editor }: { editor: Editor }) {
  function promptForLink() {
    const previous = editor.getAttributes('link').href as string | undefined
    const entered = window.prompt('Link address', previous ?? 'https://')
    if (entered === null) return

    if (entered.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }

    if (!isSafeHref(entered)) {
      window.alert('Links must be http, https or mailto addresses.')
      return
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: entered.trim() }).run()
  }

  const controls: { label: string; isActive: boolean; run: () => void }[] = [
    {
      label: 'Heading',
      isActive: editor.isActive('heading', { level: 2 }),
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: 'Bold',
      isActive: editor.isActive('bold'),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: 'Italic',
      isActive: editor.isActive('italic'),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: 'List',
      isActive: editor.isActive('bulletList'),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: 'Numbered',
      isActive: editor.isActive('orderedList'),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: 'Quote',
      isActive: editor.isActive('blockquote'),
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
  ]

  return (
    <div className="editor__bar" role="toolbar" aria-label="Formatting">
      {controls.map((control) => (
        <button
          key={control.label}
          type="button"
          className="editor__tool"
          aria-pressed={control.isActive}
          onClick={control.run}
        >
          {control.label}
        </button>
      ))}
      <button
        type="button"
        className="editor__tool"
        aria-pressed={editor.isActive('link')}
        onClick={promptForLink}
      >
        Link
      </button>
    </div>
  )
}

interface LoreEditorProps {
  value: string | null
  onChange: (json: string) => void
}

export function LoreEditor({ value, onChange }: LoreEditorProps) {
  const editor = useEditor({
    extensions,
    content: value ? (JSON.parse(value) as object) : '',
    onUpdate: ({ editor: current }) => onChange(JSON.stringify(current.getJSON())),
    editorProps: {
      attributes: {
        class: 'editor__surface',
        'data-testid': 'lore-editor',
        'aria-label': 'Lore article',
      },
    },
  })

  if (!editor) return null

  return (
    <div className="editor">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}

/**
 * Read-only rendering of the same document. Uses the editor in non-editable mode rather
 * than generating HTML, so nothing is ever handed to dangerouslySetInnerHTML.
 */
export function LoreArticle({ content }: { content: string | null }) {
  const editor = useEditor(
    {
      extensions,
      editable: false,
      content: content ? (JSON.parse(content) as object) : '',
      editorProps: {
        attributes: { class: 'article__body', 'data-testid': 'lore-article' },
      },
    },
    [content],
  )

  useEffect(() => {
    editor?.setEditable(false)
  }, [editor])

  if (!editor) return null

  return <EditorContent editor={editor} />
}
