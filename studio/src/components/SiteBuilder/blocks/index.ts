import type { Editor } from 'grapesjs';

export function registerCustomBlocks(editor: Editor) {
  const bm = editor.BlockManager;

  bm.add('hero-section', {
    label: 'Hero Section',
    category: 'Sections',
    attributes: { class: 'fa fa-image' },
    content: `
      <section style="position:relative;min-height:80vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);overflow:hidden;padding:60px 20px;">
        <div style="position:absolute;inset:0;background:rgba(0,0,0,0.4);z-index:1;"></div>
        <div style="position:relative;z-index:2;text-align:center;max-width:800px;">
          <h1 style="font-size:3.5rem;font-weight:800;color:#fff;margin-bottom:20px;line-height:1.1;">Your Bold Headline Here</h1>
          <p style="font-size:1.25rem;color:rgba(255,255,255,0.85);margin-bottom:40px;line-height:1.6;">A compelling sub-headline that describes your value proposition and captures attention.</p>
          <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap;">
            <a href="#" style="display:inline-block;padding:14px 36px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:1rem;transition:background 0.2s;">Get Started</a>
            <a href="#" style="display:inline-block;padding:14px 36px;background:transparent;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:1rem;border:2px solid rgba(255,255,255,0.3);transition:border-color 0.2s;">Learn More</a>
          </div>
        </div>
      </section>
    `,
  });

  bm.add('book-grid', {
    label: 'Book Grid',
    category: 'Sections',
    attributes: { class: 'fa fa-th' },
    content: `
      <section style="padding:80px 20px;background:#0c0c14;">
        <h2 style="text-align:center;font-size:2.25rem;font-weight:700;color:#fff;margin-bottom:48px;">Our Books</h2>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:24px;max-width:1200px;margin:0 auto;">
          ${[1, 2, 3, 4].map(i => `
          <div style="background:#14141f;border-radius:12px;overflow:hidden;border:1px solid #2a2a3d;transition:transform 0.2s,box-shadow 0.2s;">
            <div style="height:280px;background:linear-gradient(135deg,#7c3aed,#ec4899);display:flex;align-items:center;justify-content:center;">
              <span style="font-size:3rem;color:rgba(255,255,255,0.3);">Book ${i}</span>
            </div>
            <div style="padding:20px;">
              <h3 style="font-size:1.1rem;font-weight:600;color:#fff;margin-bottom:8px;">Book Title ${i}</h3>
              <p style="font-size:0.875rem;color:rgba(255,255,255,0.6);margin-bottom:12px;">A short description of this amazing book.</p>
              <span style="font-size:1rem;font-weight:700;color:#7c3aed;">$9.99</span>
            </div>
          </div>`).join('')}
        </div>
      </section>
    `,
  });

  bm.add('video-carousel', {
    label: 'Video Carousel',
    category: 'Sections',
    attributes: { class: 'fa fa-film' },
    content: `
      <section style="padding:80px 20px;background:#14141f;">
        <h2 style="text-align:center;font-size:2.25rem;font-weight:700;color:#fff;margin-bottom:48px;">Featured Videos</h2>
        <div style="display:flex;gap:24px;overflow-x:auto;max-width:1200px;margin:0 auto;padding-bottom:16px;">
          ${[1, 2, 3, 4, 5].map(i => `
          <div style="min-width:300px;background:#0c0c14;border-radius:12px;overflow:hidden;border:1px solid #2a2a3d;flex-shrink:0;">
            <div style="height:170px;background:linear-gradient(135deg,#0f3460,#1a1a2e);display:flex;align-items:center;justify-content:center;">
              <span style="font-size:2.5rem;color:rgba(255,255,255,0.2);">&#9654;</span>
            </div>
            <div style="padding:16px;">
              <h3 style="font-size:1rem;font-weight:600;color:#fff;margin-bottom:4px;">Video Title ${i}</h3>
              <p style="font-size:0.8rem;color:rgba(255,255,255,0.5);">2:30 &bull; 1.2K views</p>
            </div>
          </div>`).join('')}
        </div>
      </section>
    `,
  });

  bm.add('testimonial-section', {
    label: 'Testimonials',
    category: 'Sections',
    attributes: { class: 'fa fa-quote-right' },
    content: `
      <section style="padding:80px 20px;background:#0c0c14;">
        <h2 style="text-align:center;font-size:2.25rem;font-weight:700;color:#fff;margin-bottom:48px;">What Our Customers Say</h2>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;max-width:1000px;margin:0 auto;">
          ${['Alice M.', 'Bob K.', 'Carol J.'].map((name) => `
          <div style="background:#14141f;border-radius:12px;padding:32px;border:1px solid #2a2a3d;">
            <div style="color:#eab308;font-size:1.25rem;margin-bottom:16px;">${'&#9733;'.repeat(5)}</div>
            <p style="color:rgba(255,255,255,0.8);font-style:italic;margin-bottom:20px;line-height:1.6;">"This product completely transformed our workflow. Highly recommended to anyone looking for quality."</p>
            <p style="font-weight:600;color:#fff;font-size:0.95rem;">${name}</p>
          </div>`).join('')}
        </div>
      </section>
    `,
  });

  bm.add('cta-banner', {
    label: 'CTA Banner',
    category: 'Sections',
    attributes: { class: 'fa fa-bullhorn' },
    content: `
      <section style="padding:60px 20px;background:linear-gradient(135deg,#7c3aed,#ec4899);text-align:center;">
        <h2 style="font-size:2.5rem;font-weight:800;color:#fff;margin-bottom:16px;">Ready to Get Started?</h2>
        <p style="font-size:1.15rem;color:rgba(255,255,255,0.9);margin-bottom:32px;max-width:600px;margin-left:auto;margin-right:auto;">Join thousands of creators who are already building amazing things.</p>
        <a href="#" style="display:inline-block;padding:16px 40px;background:#fff;color:#7c3aed;text-decoration:none;border-radius:8px;font-weight:700;font-size:1.05rem;">Start Free Trial</a>
      </section>
    `,
  });

  bm.add('footer-block', {
    label: 'Footer',
    category: 'Sections',
    attributes: { class: 'fa fa-bars' },
    content: `
      <footer style="padding:60px 20px 30px;background:#0a0a12;border-top:1px solid #2a2a3d;">
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:40px;max-width:1200px;margin:0 auto 40px;">
          <div>
            <h4 style="font-size:1.1rem;font-weight:700;color:#fff;margin-bottom:16px;">Brand</h4>
            <p style="font-size:0.875rem;color:rgba(255,255,255,0.5);line-height:1.6;">Building amazing products for creators worldwide.</p>
          </div>
          <div>
            <h4 style="font-size:0.9rem;font-weight:600;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:16px;">Product</h4>
            <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px;">
              <li><a href="#" style="color:rgba(255,255,255,0.5);text-decoration:none;font-size:0.875rem;">Features</a></li>
              <li><a href="#" style="color:rgba(255,255,255,0.5);text-decoration:none;font-size:0.875rem;">Pricing</a></li>
              <li><a href="#" style="color:rgba(255,255,255,0.5);text-decoration:none;font-size:0.875rem;">Changelog</a></li>
            </ul>
          </div>
          <div>
            <h4 style="font-size:0.9rem;font-weight:600;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:16px;">Company</h4>
            <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px;">
              <li><a href="#" style="color:rgba(255,255,255,0.5);text-decoration:none;font-size:0.875rem;">About</a></li>
              <li><a href="#" style="color:rgba(255,255,255,0.5);text-decoration:none;font-size:0.875rem;">Blog</a></li>
              <li><a href="#" style="color:rgba(255,255,255,0.5);text-decoration:none;font-size:0.875rem;">Contact</a></li>
            </ul>
          </div>
          <div>
            <h4 style="font-size:0.9rem;font-weight:600;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:16px;">Social</h4>
            <div style="display:flex;gap:12px;">
              <a href="#" style="width:36px;height:36px;border-radius:8px;background:#14141f;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.5);text-decoration:none;font-size:0.8rem;">X</a>
              <a href="#" style="width:36px;height:36px;border-radius:8px;background:#14141f;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.5);text-decoration:none;font-size:0.8rem;">IG</a>
              <a href="#" style="width:36px;height:36px;border-radius:8px;background:#14141f;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.5);text-decoration:none;font-size:0.8rem;">YT</a>
            </div>
          </div>
        </div>
        <div style="text-align:center;padding-top:24px;border-top:1px solid #1c1c2a;">
          <p style="font-size:0.8rem;color:rgba(255,255,255,0.3);">&copy; 2026 Your Brand. All rights reserved.</p>
        </div>
      </footer>
    `,
  });

  bm.add('faq-accordion', {
    label: 'FAQ Accordion',
    category: 'Sections',
    attributes: { class: 'fa fa-question-circle' },
    content: `
      <section style="padding:80px 20px;background:#0c0c14;">
        <h2 style="text-align:center;font-size:2.25rem;font-weight:700;color:#fff;margin-bottom:48px;">Frequently Asked Questions</h2>
        <div style="max-width:700px;margin:0 auto;display:flex;flex-direction:column;gap:12px;">
          ${[
            { q: 'How does it work?', a: 'Simply sign up, choose a plan, and start building your projects with our intuitive tools.' },
            { q: 'Can I cancel anytime?', a: 'Yes, you can cancel your subscription at any time with no hidden fees or penalties.' },
            { q: 'Do you offer support?', a: 'We offer 24/7 email support and live chat during business hours for all plans.' },
          ].map(({ q, a }) => `
          <details style="background:#14141f;border:1px solid #2a2a3d;border-radius:10px;overflow:hidden;">
            <summary style="padding:20px 24px;cursor:pointer;font-weight:600;color:#fff;font-size:1rem;list-style:none;display:flex;align-items:center;justify-content:space-between;">${q}</summary>
            <div style="padding:0 24px 20px;color:rgba(255,255,255,0.7);font-size:0.95rem;line-height:1.6;">${a}</div>
          </details>`).join('')}
        </div>
      </section>
    `,
  });

  bm.add('pricing-table', {
    label: 'Pricing Table',
    category: 'Sections',
    attributes: { class: 'fa fa-tags' },
    content: `
      <section style="padding:80px 20px;background:#14141f;">
        <h2 style="text-align:center;font-size:2.25rem;font-weight:700;color:#fff;margin-bottom:48px;">Choose Your Plan</h2>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;max-width:1000px;margin:0 auto;">
          ${[
            { name: 'Basic', price: '$9', features: ['5 Projects', '1 GB Storage', 'Email Support'] },
            { name: 'Pro', price: '$29', features: ['Unlimited Projects', '10 GB Storage', 'Priority Support', 'API Access'] },
            { name: 'Premium', price: '$79', features: ['Everything in Pro', '100 GB Storage', 'Dedicated Account Manager', 'Custom Integrations', 'SLA Guarantee'] },
          ].map(({ name, price, features }, idx) => `
          <div style="background:${idx === 1 ? 'linear-gradient(135deg,#7c3aed,#6d28d9)' : '#0c0c14'};border-radius:16px;padding:40px 32px;border:1px solid ${idx === 1 ? 'transparent' : '#2a2a3d'};text-align:center;${idx === 1 ? 'transform:scale(1.05);' : ''}">
            <h3 style="font-size:1.1rem;font-weight:600;color:${idx === 1 ? '#fff' : 'rgba(255,255,255,0.7)'};margin-bottom:8px;">${name}</h3>
            <div style="font-size:2.5rem;font-weight:800;color:#fff;margin-bottom:4px;">${price}</div>
            <p style="font-size:0.85rem;color:rgba(255,255,255,0.5);margin-bottom:28px;">/month</p>
            <ul style="list-style:none;padding:0;margin:0 0 32px;display:flex;flex-direction:column;gap:12px;">
              ${features.map(f => `<li style="font-size:0.9rem;color:rgba(255,255,255,0.75);">&#10003; ${f}</li>`).join('')}
            </ul>
            <a href="#" style="display:inline-block;padding:12px 32px;background:${idx === 1 ? '#fff' : '#7c3aed'};color:${idx === 1 ? '#7c3aed' : '#fff'};text-decoration:none;border-radius:8px;font-weight:600;font-size:0.95rem;">Get Started</a>
          </div>`).join('')}
        </div>
      </section>
    `,
  });
}
