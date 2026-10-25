import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

// LICENSE and NOTICE are bundled with every build (see vite.config.ts), as Apache-2.0 requires.
export default function Licenses() {
  const [texts, setTexts] = useState<{ notice: string; license: string } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const read = (f: string) => fetch(f).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${f} missing`))))
    Promise.all([read('NOTICE.txt'), read('LICENSE.txt')])
      .then(([notice, license]) => setTexts({ notice, license }))
      .catch((e) => setError(e.message))
  }, [])

  return (
    <>
      <div className="spread">
        <h1>Licenses</h1>
        <Link to="/setup">Back</Link>
      </div>
      {error && <p className="error">{error}</p>}
      {texts && (
        <>
          <pre className="legal">{texts.notice}</pre>
          <pre className="legal">{texts.license}</pre>
        </>
      )}
    </>
  )
}
