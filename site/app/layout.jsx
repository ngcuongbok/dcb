import './style.css';
import Script from 'next/script';
const title='DiciiBooth | Lưu giữ những khoảnh khắc';
const description='DiciiBooth — Photobooth và SelfBooth tại Hà Nội. Lưu giữ những khoảnh khắc thật riêng cùng bạn bè và những người thương.';
export const metadata={metadataBase:new URL('https://diciibooth.vn'),title,description,alternates:{canonical:'/'},openGraph:{type:'website',url:'https://diciibooth.vn/',siteName:'DiciiBooth',locale:'vi_VN',title,description,images:['https://i.ibb.co/ksJDTmT7/new-transparent.png']},twitter:{card:'summary_large_image',title,description,images:['https://i.ibb.co/ksJDTmT7/new-transparent.png']},icons:{icon:'https://i.ibb.co/ksJDTmT7/new-transparent.png'},robots:{index:true,follow:true}};
export default function Layout({children}){return <html lang="vi"><body>{children}<Script src="https://www.googletagmanager.com/gtag/js?id=G-CBCN5L3J7X" strategy="afterInteractive"/><Script id="google-analytics" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-CBCN5L3J7X');`}</Script></body></html>}
