import { defineComponent, h, ref, type PropType, onMounted, onUnmounted, nextTick } from 'vue';
import { trapFocus } from '../../lib/dom';

export interface LogoItem {
  id: string;
  name: string;
  description: string;
  alt: string;
  gridSrc: string;
  gridSrcset: string;
  previewSrc: string;
  previewSrcset: string;
}

// Check if we're on mobile/tablet breakpoint
function isMobileBreakpoint(): boolean {
    return window.innerWidth <= 900;
}

export default defineComponent({
    name: 'LogoShowcase',
    props: {
        logos: { type: Array as PropType<LogoItem[]>, default: () => [] }
    },
    setup(props) {
        const selectedLogo = ref<number | null>(null);
        const focusedIndex = ref<number>(0);
        const mainContentRef = ref<HTMLElement | null>(null);
        const gridContainerRef = ref<HTMLElement | null>(null);
        const sectionRef = ref<HTMLElement | null>(null);
        const closeButtonRef = ref<HTMLButtonElement | null>(null);

        // State for scroll cue
        const canScrollDown = ref(false);
        const isHoveringBottom = ref(false);
        const isInitial = ref(true);
        
        // History state management for mobile back button
        const historyStatePushed = ref(false);
        const isClosingFromHistory = ref(false);

        // Focus trap cleanup
        let releaseFocusTrap: (() => void) | null = null;

        const checkScroll = () => {
            if (!mainContentRef.value) return;
            const el = mainContentRef.value;
            canScrollDown.value = el.scrollHeight - el.scrollTop > el.clientHeight + 5;
        };

        const handleScroll = () => {
            checkScroll();
            if (isInitial.value) {
                isInitial.value = false;
            }
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (!gridContainerRef.value) return;
            const rect = gridContainerRef.value.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const height = rect.height;
            const bottomThreshold = height - 120;

            isHoveringBottom.value = y > bottomThreshold;
        };

        const handleMouseLeave = () => {
            isHoveringBottom.value = false;
        };

        const scrollDown = () => {
            if (!mainContentRef.value) return;
            const el = mainContentRef.value;
            el.scrollBy({ top: el.clientHeight * 0.7, behavior: 'smooth' });
        };

        const scrollToItem = (index: number) => {
            if (!mainContentRef.value) return;
            const items = mainContentRef.value.querySelectorAll('.logo-item');
            const item = items[index] as HTMLElement;
            if (item) {
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        };

        const handleLogoClick = (index: number) => {
            if (selectedLogo.value === index) {
                closeDetail();
            } else {
                selectedLogo.value = index;
                focusedIndex.value = index;
                
                // Push history state on mobile to enable back button
                if (isMobileBreakpoint() && !historyStatePushed.value) {
                    window.history.pushState({ logoDetail: true }, '');
                    historyStatePushed.value = true;
                }
                
                // Lock body scroll on mobile and hide site header
                if (isMobileBreakpoint()) {
                    document.body.style.overflow = 'hidden';
                    document.body.classList.add('ls-panel-open');
                }
                
                // Focus the close button and trap focus after panel opens
                nextTick(() => {
                    closeButtonRef.value?.focus();
                    const panel = closeButtonRef.value?.closest('.detail-panel') as HTMLElement | null;
                    if (panel) {
                        releaseFocusTrap = trapFocus(panel, 'button, [href], [tabindex]:not([tabindex="-1"])');
                    }
                });
            }
            setTimeout(checkScroll, 650);
        };

        const closeDetail = (fromPopstate = false) => {
            if (releaseFocusTrap) {
                releaseFocusTrap();
                releaseFocusTrap = null;
            }
            selectedLogo.value = null;
            focusedIndex.value = -1;
            setTimeout(checkScroll, 650);
            
            // Restore body scroll and show site header
            document.body.style.overflow = '';
            document.body.classList.remove('ls-panel-open');
            
            // If we pushed history state and this isn't from popstate, go back
            if (historyStatePushed.value && !fromPopstate && !isClosingFromHistory.value) {
                isClosingFromHistory.value = true;
                window.history.back();
                // Reset flag after history navigation
                setTimeout(() => {
                    isClosingFromHistory.value = false;
                    historyStatePushed.value = false;
                }, 100);
            } else {
                historyStatePushed.value = false;
            }
            
            // Blur any focused element to remove highlight
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
        };
        
        // Handle browser back button
        const handlePopstate = (e: PopStateEvent) => {
            if (selectedLogo.value !== null && historyStatePushed.value) {
                e.preventDefault();
                historyStatePushed.value = false;
                closeDetail(true);
            }
        };

        // Keyboard navigation
        const handleKeyDown = (e: KeyboardEvent) => {
            const logos = props.logos;
            if (!logos.length) return;

            // If detail panel is open, only handle Escape
            if (selectedLogo.value !== null) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    closeDetail();
                }
                return;
            }

            const cols = window.innerWidth >= 1024 ? 4 : window.innerWidth >= 768 ? 3 : 2;
            let newIndex = focusedIndex.value;

            switch (e.key) {
                case 'ArrowRight':
                    e.preventDefault();
                    newIndex = Math.min(focusedIndex.value + 1, logos.length - 1);
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    newIndex = Math.max(focusedIndex.value - 1, 0);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    newIndex = Math.min(focusedIndex.value + cols, logos.length - 1);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    newIndex = Math.max(focusedIndex.value - cols, 0);
                    break;
                case 'Enter':
                case ' ':
                    e.preventDefault();
                    handleLogoClick(focusedIndex.value);
                    return;
                case 'Home':
                    e.preventDefault();
                    newIndex = 0;
                    break;
                case 'End':
                    e.preventDefault();
                    newIndex = logos.length - 1;
                    break;
                default:
                    return;
            }

            if (newIndex !== focusedIndex.value) {
                focusedIndex.value = newIndex;
                scrollToItem(newIndex);
                // Focus the new item
                nextTick(() => {
                    const items = mainContentRef.value?.querySelectorAll('.logo-placeholder');
                    const item = items?.[newIndex] as HTMLElement;
                    item?.focus();
                });
            }
        };

        // Handle click outside to close panel
        const handleClickOutside = (e: MouseEvent) => {
            if (selectedLogo.value === null) return;
            const target = e.target as HTMLElement;
            const panel = target.closest('.detail-panel');
            const card = target.closest('.logo-placeholder');
            if (!panel && !card) {
                closeDetail();
            }
        };

        onMounted(() => {
            nextTick(checkScroll);
            setTimeout(checkScroll, 100);
            setTimeout(checkScroll, 300);
            setTimeout(checkScroll, 500);
            window.addEventListener('resize', checkScroll);
            document.addEventListener('keydown', handleKeyDown);
            window.addEventListener('popstate', handlePopstate);
        });

        onUnmounted(() => {
            window.removeEventListener('resize', checkScroll);
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('popstate', handlePopstate);
            // Restore body scroll if we unmount with panel open
            document.body.style.overflow = '';
        });

        return () => {
            const logoItems = props.logos;
            const selectedLogoData = selectedLogo.value !== null ? logoItems[selectedLogo.value] : null;
            const logoCount = logoItems.length;

            const showCue = canScrollDown.value && (isInitial.value || isHoveringBottom.value);

            // Section Title
            const sectionTitle = h('header', { class: 'ls-section-title' }, [
                h('h2', { class: 'ls-section-title__text' }, 'Logo design'),
                h('div', { class: 'ls-section-title__flourish', 'aria-hidden': 'true' }, [
                    h('span', { class: 'ls-section-title__flourish-icon' }),
                ]),
                h('span', { class: 'ls-section-title__sub' }, `${logoCount} selected works`),
            ]);

            return h('section', {
                class: ['logo-showcase', { 'has-selection': selectedLogo.value !== null }],
                ref: sectionRef,
                onClick: handleClickOutside,
                role: 'region',
                'aria-label': 'Logo design portfolio'
            }, [
                sectionTitle,
                h('div', { class: 'showcase-wrapper' }, [
                    // Grid Container
                    h('div', {
                        class: 'grid-container',
                        ref: gridContainerRef,
                        onMousemove: handleMouseMove,
                        onMouseleave: handleMouseLeave
                    }, [
                        h('div', {
                            class: 'main-content',
                            ref: mainContentRef,
                            onScroll: handleScroll
                        }, [
                            h('div', {
                                class: 'logo-grid',
                                role: 'list',
                                'aria-label': 'Logo gallery'
                            },
                                logoItems.map((logo, index) => {
                                    const isSelected = selectedLogo.value === index;
                                    const isFocused = focusedIndex.value === index;

                                    return h('div', {
                                        class: 'logo-item',
                                        key: logo.id,
                                        role: 'listitem'
                                    }, [
                                        h('div', {
                                            class: ['logo-placeholder', {
                                                'is-selected': isSelected,
                                                'is-focused': isFocused
                                            }],
                                            tabindex: isFocused ? 0 : -1,
                                            role: 'button',
                                            'aria-pressed': isSelected,
                                            'aria-label': `${logo.name}. Click to view details`,
                                            onClick: (e: MouseEvent) => {
                                                e.stopPropagation();
                                                handleLogoClick(index);
                                            },
                                            onKeydown: (e: KeyboardEvent) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    handleLogoClick(index);
                                                }
                                            },
                                            onFocus: () => {
                                                focusedIndex.value = index;
                                            }
                                        }, [
                                            // Grid Image
                                            h('img', {
                                                class: 'logo-image logo-image-grid',
                                                src: logo.gridSrc,
                                                srcset: logo.gridSrcset,
                                                sizes: '(max-width: 600px) 45vw, (max-width: 1024px) 30vw, 280px',
                                                alt: logo.alt,
                                                loading: 'lazy'
                                            }),
                                            // Preview Image (Hover)
                                            h('img', {
                                                class: 'logo-image logo-image-preview',
                                                src: logo.previewSrc,
                                                srcset: logo.previewSrcset,
                                                sizes: '(max-width: 900px) 90vw, 540px',
                                                alt: '',
                                                'aria-hidden': 'true',
                                                loading: 'lazy'
                                            })
                                        ])
                                    ])
                                })
                            )
                        ]),
                        // Scroll Indicator
                        h('div', {
                            class: ['scroll-indicator', { 'is-visible': showCue }],
                            onClick: (e: MouseEvent) => {
                                e.stopPropagation();
                                scrollDown();
                            },
                            role: 'button',
                            'aria-label': 'Scroll down to see more logos',
                            tabindex: showCue ? 0 : -1
                        }, [
                            h('span', { class: 'scroll-arrow', 'aria-hidden': 'true' }, '↓')
                        ])
                    ]),

                    // Detail Panel
                    selectedLogoData ? h('aside', {
                        class: 'detail-panel',
                        role: 'dialog',
                        'aria-label': `Details for ${selectedLogoData.name}`,
                        'aria-modal': 'true'
                    }, [
                        h('div', { class: 'detail-content' }, [
                            h('button', {
                                class: 'close-button',
                                ref: closeButtonRef,
                                onClick: (e: MouseEvent) => {
                                    e.stopPropagation();
                                    closeDetail();
                                },
                                'aria-label': 'Close details panel'
                            }, '×'),
                            h('div', { class: 'detail-logo' }, [
                                h('img', {
                                    class: 'detail-logo-image',
                                    src: selectedLogoData.previewSrc,
                                    srcset: selectedLogoData.previewSrcset,
                                    alt: selectedLogoData.alt,
                                    onError: (e: Event) => {
                                        const img = e.target as HTMLImageElement;
                                        const logoDiv = img.parentElement;
                                        if (logoDiv) {
                                            img.style.display = 'none';
                                            const textSpan = document.createElement('span');
                                            textSpan.className = 'detail-logo-text';
                                            textSpan.textContent = selectedLogoData.name;
                                            logoDiv.appendChild(textSpan);
                                        }
                                    }
                                })
                            ]),
                            h('div', { class: 'detail-info' }, [
                                h('h3', { class: 'detail-title' }, selectedLogoData.name),
                                h('p', { class: 'detail-description' }, selectedLogoData.description)
                            ])
                        ])
                    ]) : null
                ])
            ]);
        };
    }
});
