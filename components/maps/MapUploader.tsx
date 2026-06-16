'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createMap } from '@/lib/actions/maps'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Card } from '@/components/ui/Card'

interface MapUploaderProps {
  campaignId: string
}

const MAX_BYTES = 15 * 1024 * 1024 // 15 MB
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

function loadImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image dimensions.'))
    }
    img.src = url
  })
}

export function MapUploader({ campaignId }: MapUploaderProps) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    const f = e.target.files?.[0]
    if (!f) return
    if (!ACCEPTED.includes(f.type)) {
      setError('Please choose a PNG, JPG, WEBP, or GIF image.')
      return
    }
    if (f.size > MAX_BYTES) {
      setError('Image is too large (max 15 MB).')
      return
    }
    setFile(f)
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''))
    setPreview(URL.createObjectURL(f))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Please choose a map image.')
      return
    }
    if (!name.trim()) {
      setError('Please give the map a name.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { width, height } = await loadImageSize(file)
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      const path = `${campaignId}/${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('maps')
        .upload(path, file, { contentType: file.type, upsert: false })

      if (uploadError) {
        setError(`Upload failed: ${uploadError.message}`)
        setLoading(false)
        return
      }

      const result = await createMap(campaignId, {
        name: name.trim(),
        storage_path: path,
        width,
        height,
      })

      if (result?.error) {
        // Roll back the uploaded file if the row could not be created.
        await supabase.storage.from('maps').remove([path])
        setError(result.error)
        setLoading(false)
        return
      }

      router.push(`/campaigns/${campaignId}/live-map/${result.mapId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {error && <Alert message={error} />}

      <Card>
        <Input
          label="Map name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Goblin Ambush — Triboar Trail"
          required
        />

        <div className="mt-5">
          <label className="text-sm font-medium text-zinc-300 block mb-2">
            Map image
          </label>
          <label
            htmlFor="map-file"
            className="flex flex-col items-center justify-center gap-2 py-10 px-6 rounded-lg border-2 border-dashed border-zinc-700 hover:border-zinc-600 cursor-pointer transition-colors text-center"
          >
            <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <span className="text-sm text-zinc-400">
              {file ? file.name : 'Click to choose an image'}
            </span>
            <span className="text-xs text-zinc-600">PNG, JPG, WEBP, or GIF · up to 15 MB</span>
          </label>
          <input
            id="map-file"
            type="file"
            accept={ACCEPTED.join(',')}
            onChange={onFileChange}
            className="hidden"
          />
        </div>

        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Map preview"
            className="mt-4 max-h-64 w-full object-contain rounded-lg border border-zinc-800 bg-zinc-950"
          />
        )}
      </Card>

      <div className="flex gap-3">
        <Button type="submit" loading={loading} disabled={!file}>
          Upload &amp; open editor
        </Button>
      </div>
    </form>
  )
}
