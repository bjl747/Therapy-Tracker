import { createRoot } from 'react-dom/client'
import '@/index.css'
import { PdfStudio } from './PdfStudio'
if (location.search.includes('dark')) document.documentElement.classList.add('dark')
createRoot(document.getElementById('root')!).render(<div style={{height:'100vh'}}><PdfStudio /></div>)
