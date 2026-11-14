const fb = 'https://www.facebook.com/profile.php?id=61576514052593';
const tiktok = 'https://www.tiktok.com/@dicii.photobooth';

export default function Home() {
  return <>
    <header className="header" id="top">
      <a className="brand" href="/" aria-label="DiciiBooth - Trang chủ"><span className="brand-star" aria-hidden="true">✦</span><span>dicii<strong>booth</strong><small>PHOTOBOOTH & SELFBOOTH</small></span></a>
      <nav aria-label="Điều hướng chính">
        <a href="#trai-nghiem">Trải nghiệm</a>
        <a href="/photobooth-di-dong">Photobooth di động</a>
        <a href="#anh-cua-ban">Nhận ảnh</a>
        <a className="navbutton" href={fb} target="_blank" rel="noopener noreferrer">Liên hệ Dicii ↗</a>
      </nav>
    </header>
    <main>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy"><p className="eyebrow">HÀ NỘI · PHOTOBOOTH & SELFBOOTH</p><h1 id="hero-title">CHỤP MỘT TẤM.<br/><em>GIỮ MỘT ĐỜI.</em></h1><p className="hero-description">Một chút ánh sáng, một chút tinh nghịch và thật nhiều khoảnh khắc đáng nhớ cùng những người thương.</p><div className="actions"><a href="#trai-nghiem" className="button button-yellow">Khám phá Dicii <span>↗</span></a><a className="hero-link" href="#anh-cua-ban">Cách nhận ảnh ↓</a></div></div>
        <div className="hero-art"><img src="/images/dicii-collage.webp" alt="Minh họa collage máy ảnh và những khoảnh khắc photobooth" fetchPriority="high"/><span className="hero-caption">HÌNH MINH HỌA · DICII MOMENTS</span></div>
        <div className="hero-bottom"><span>GÓI GHÉM NIỀM VUI CỦA BẠN</span><span>CUỘN XUỐNG ĐỂ KHÁM PHÁ ↓</span></div>
      </section>
      <div className="ticker" aria-hidden="true"><div>CHỤP THẬT VUI <b>✦</b> GIỮ THẬT LÂU <b>✦</b> DICII MOMENTS <b>✦</b> CHỤP THẬT VUI <b>✦</b> GIỮ THẬT LÂU <b>✦</b> DICII MOMENTS <b>✦</b></div></div>
      <section className="intro" id="trai-nghiem"><div className="intro-label"><p className="eyebrow">01 / XIN CHÀO, DICII ĐÂY!</p><span className="seal" aria-hidden="true">✳</span></div><div><h2>MỖI KHUNG HÌNH<br/><em>MỘT CÂU CHUYỆN.</em></h2><p>Ở DiciiBooth, mỗi lần bấm máy là một dịp để dừng lại, vui cùng nhau và mang về một kỷ niệm của riêng mình.</p></div></section>
      <section className="experiences" aria-label="Trải nghiệm tại DiciiBooth"><article className="experience experience-photo"><div className="experience-top"><span>01 / PHOTOBOOTH</span><span>✳</span></div><div><h3>PHOTO<br/>BOOTH<span>.</span></h3><p>Lưu lại những biểu cảm tự nhiên và những khoảnh khắc đáng yêu cùng nhau.</p><a className="experience-link" href="/photobooth-di-dong">Tìm hiểu photobooth di động ↗</a></div></article><article className="experience experience-self"><div className="experience-top"><span>02 / SELFBOOTH</span><span>✷</span></div><div><h3>SELF<br/>BOOTH<span>.</span></h3><p>Thỏa sức tạo dáng, tự mình ghi lại câu chuyện theo cách bạn thích.</p></div></article></section>
      <section className="receive" id="anh-cua-ban"><div className="receive-image"><img src="/images/dicii-moments.webp" alt="Minh họa dải ảnh photobooth cùng bạn bè" loading="lazy"/><span>YOUR MOMENTS,<br/>YOUR STORY. ✳</span></div><div className="receive-copy"><p className="eyebrow">02 / ẢNH CỦA BẠN</p><h2>KỶ NIỆM<br/><em>Ở NGAY ĐÂY.</em></h2><p>Sau buổi chụp, hãy quét mã QR được cung cấp để mở bộ ảnh của riêng bạn. Từ đó, bạn có thể xem và tải những khoảnh khắc yêu thích.</p><p>Cần hỗ trợ tìm ảnh? Nhắn tin cho Dicii, tụi mình luôn sẵn sàng giúp bạn.</p><a className="button button-outline" href={fb} target="_blank" rel="noopener noreferrer">Nhắn tin cho Dicii ↗</a></div></section>
      <section className="closing"><p className="eyebrow">SEE YOU AT DICII ✳</p><h2>HẸN GẶP BẠN<br/><em>TRONG MỘT KHUNG HÌNH.</em></h2><a href={fb} target="_blank" rel="noopener noreferrer" className="button button-yellow">Liên hệ Dicii ↗</a></section>
    </main>
    <footer><div><a className="brand" href="/" aria-label="DiciiBooth - Trang chủ"><span className="brand-star" aria-hidden="true">✦</span><span>dicii<strong>booth</strong><small>PHOTOBOOTH & SELFBOOTH</small></span></a><p>Một chút ánh sáng. Rất nhiều kỷ niệm.</p></div><div className="footerlinks"><a href="#trai-nghiem">Trải nghiệm</a><a href="#anh-cua-ban">Nhận ảnh</a><a href={fb} target="_blank" rel="noopener noreferrer">Facebook ↗</a><a href={tiktok} target="_blank" rel="noopener noreferrer">TikTok ↗</a></div><small>© {new Date().getFullYear()} DiciiBooth · Hà Nội</small></footer>
  </>;
}
