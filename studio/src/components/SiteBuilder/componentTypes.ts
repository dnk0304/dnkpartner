import type { Editor, Component } from 'grapesjs';

/**
 * Custom component types with traits (the right-panel Settings tab).
 * Each type carries a `data-locked-on-owner` attribute — used by
 * `applyOwnerLocks` so the owner can edit text/images but cannot
 * accidentally drag, delete, or duplicate the page skeleton.
 */
export function registerCustomTypes(editor: Editor) {
  const dc = editor.DomComponents;

  // ── CTA button ──────────────────────────────────────────
  dc.addType('trades-cta', {
    isComponent: (el) =>
      el?.tagName === 'A' && (el as HTMLElement).getAttribute?.('data-gjs-type') === 'trades-cta',
    model: {
      defaults: {
        tagName: 'a',
        attributes: {
          'data-gjs-type': 'trades-cta',
          href: '#',
        },
        components: 'Get a Free Quote',
        style: {
          display: 'inline-block',
          padding: '14px 32px',
          background: 'var(--brand-primary, #7c3aed)',
          color: '#ffffff',
          'text-decoration': 'none',
          'border-radius': 'var(--brand-radius, 8px)',
          'font-weight': '700',
          'font-size': '1rem',
        },
        traits: [
          { type: 'text', name: 'label', label: 'Button text', changeProp: true },
          { type: 'text', name: 'href', label: 'Link URL' },
          {
            type: 'checkbox',
            name: 'target',
            label: 'Open in new tab',
            valueTrue: '_blank',
            valueFalse: '',
          },
          {
            type: 'select',
            name: 'variant',
            label: 'Style',
            options: [
              { id: 'primary', label: 'Primary' },
              { id: 'secondary', label: 'Secondary (outline)' },
            ],
            changeProp: true,
          },
        ],
        label: 'CTA Button',
        variant: 'primary',
      },
      init() {
        this.on('change:label', this.updateLabel);
        this.on('change:variant', this.updateVariant);
      },
      updateLabel(this: Component) {
        const label = (this as any).get('label') as string;
        if (label) this.components(label);
      },
      updateVariant(this: Component) {
        const variant = (this as any).get('variant') as string;
        if (variant === 'secondary') {
          this.setStyle({
            display: 'inline-block',
            padding: '14px 32px',
            background: 'transparent',
            color: 'var(--brand-primary, #7c3aed)',
            'text-decoration': 'none',
            'border-radius': 'var(--brand-radius, 8px)',
            'font-weight': '700',
            'font-size': '1rem',
            border: '2px solid var(--brand-primary, #7c3aed)',
          });
        } else {
          this.setStyle({
            display: 'inline-block',
            padding: '14px 32px',
            background: 'var(--brand-primary, #7c3aed)',
            color: '#ffffff',
            'text-decoration': 'none',
            'border-radius': 'var(--brand-radius, 8px)',
            'font-weight': '700',
            'font-size': '1rem',
          });
        }
      },
    },
  });

  // ── Trades Hero ─────────────────────────────────────────
  dc.addType('trades-hero', {
    model: {
      defaults: {
        tagName: 'section',
        attributes: {
          'data-gjs-type': 'trades-hero',
          'data-locked-on-owner': 'true',
        },
        style: {
          position: 'relative',
          'min-height': '70vh',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          padding: '80px 24px',
          background:
            'linear-gradient(135deg, var(--brand-primary,#1a1a2e) 0%, #0f3460 100%)',
          color: '#ffffff',
          'text-align': 'center',
          'font-family': 'var(--brand-font, Inter, sans-serif)',
        },
        components: [
          {
            tagName: 'div',
            style: { 'max-width': '760px' },
            components: [
              {
                type: 'text',
                tagName: 'h1',
                content: 'Trusted Plumbing in Your Neighborhood',
                style: {
                  'font-size': '3rem',
                  'font-weight': '800',
                  margin: '0 0 16px',
                  'line-height': '1.1',
                },
              },
              {
                type: 'text',
                tagName: 'p',
                content:
                  'Same-day service. Upfront pricing. Licensed & insured.',
                style: {
                  'font-size': '1.2rem',
                  margin: '0 0 32px',
                  opacity: '0.9',
                },
              },
              {
                type: 'trades-cta',
                components: 'Call (555) 123-4567',
                attributes: {
                  href: 'tel:+15551234567',
                  'data-gjs-type': 'trades-cta',
                },
              },
            ],
          },
        ],
      },
    },
  });

  // ── Click-to-call contact bar ───────────────────────────
  dc.addType('trades-contact-bar', {
    model: {
      defaults: {
        tagName: 'div',
        attributes: {
          'data-gjs-type': 'trades-contact-bar',
          'data-locked-on-owner': 'true',
          phone: '(555) 123-4567',
          email: 'info@yourbusiness.com',
        },
        style: {
          display: 'flex',
          'justify-content': 'center',
          'align-items': 'center',
          gap: '24px',
          padding: '14px 20px',
          background: 'var(--brand-primary, #7c3aed)',
          color: '#ffffff',
          'font-family': 'var(--brand-font, Inter, sans-serif)',
          'font-size': '0.95rem',
          'font-weight': '600',
          'flex-wrap': 'wrap',
        },
        components: [
          {
            tagName: 'a',
            attributes: { href: 'tel:+15551234567' },
            style: { color: '#fff', 'text-decoration': 'none' },
            components: [
              { tagName: 'i', attributes: { class: 'fa-solid fa-phone' }, style: { 'margin-right': '8px' } },
              { type: 'textnode', content: '(555) 123-4567' },
            ],
          },
          {
            tagName: 'a',
            attributes: { href: 'mailto:info@yourbusiness.com' },
            style: { color: '#fff', 'text-decoration': 'none' },
            components: [
              { tagName: 'i', attributes: { class: 'fa-solid fa-envelope' }, style: { 'margin-right': '8px' } },
              { type: 'textnode', content: 'info@yourbusiness.com' },
            ],
          },
        ],
        traits: [
          { type: 'text', name: 'phone', label: 'Phone number' },
          { type: 'text', name: 'email', label: 'Email address' },
        ],
      },
    },
  });

  // ── Service card (used inside service grids) ────────────
  dc.addType('trades-service-card', {
    model: {
      defaults: {
        tagName: 'div',
        attributes: {
          'data-gjs-type': 'trades-service-card',
          icon: 'fa-wrench',
          title: 'Service Name',
          blurb: 'Short description of this service.',
          price: '',
        },
        style: {
          background: '#ffffff',
          padding: '32px 24px',
          'border-radius': 'var(--brand-radius, 8px)',
          'box-shadow': '0 2px 8px rgba(0,0,0,0.08)',
          'text-align': 'left',
          'font-family': 'var(--brand-font, Inter, sans-serif)',
        },
        components: [
          {
            tagName: 'i',
            attributes: { class: 'fa-solid fa-wrench' },
            style: {
              'font-size': '2rem',
              color: 'var(--brand-primary, #7c3aed)',
              'margin-bottom': '16px',
            },
          },
          {
            type: 'text',
            tagName: 'h3',
            content: 'Service Name',
            style: { 'font-size': '1.25rem', 'font-weight': '700', margin: '0 0 8px' },
          },
          {
            type: 'text',
            tagName: 'p',
            content: 'Short description of this service.',
            style: { color: '#4b5563', margin: '0', 'line-height': '1.6' },
          },
        ],
        traits: [
          { type: 'text', name: 'title', label: 'Service title' },
          { type: 'text', name: 'blurb', label: 'Description' },
          { type: 'text', name: 'price', label: 'Price (optional)' },
        ],
      },
    },
  });
}

/**
 * Walk the component tree and lock/unlock anything marked
 * data-locked-on-owner. Leaf nodes (text, images) inside stay
 * editable so the owner can update copy and swap photos.
 */
export function applyOwnerLocks(editor: Editor, ownerMode: boolean) {
  const walk = (cmp: Component) => {
    const attrs = cmp.getAttributes() || {};
    if (attrs['data-locked-on-owner'] === 'true' || attrs['data-locked-on-owner'] === true) {
      cmp.set({
        draggable: !ownerMode,
        droppable: !ownerMode,
        removable: !ownerMode,
        copyable: !ownerMode,
        // keep `selectable: true` so users can still click into it
        // to reach editable children
      });
    }
    cmp.components().forEach(walk);
  };

  editor.getComponents().forEach(walk);
  // Also lock the top-level "wrapper" from being deleted in owner mode
  const wrapper = editor.getWrapper();
  if (wrapper) {
    wrapper.set({
      removable: false,
      copyable: false,
      draggable: false,
    });
  }
}
