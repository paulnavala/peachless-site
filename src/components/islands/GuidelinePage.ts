import { defineComponent, h, ref, PropType, watch, onMounted, onUnmounted, computed } from 'vue';

export type GuidelineItem = {
    name: string;
    path: string;
};

export type BrandItem = {
    id: string;
    name: string;
    description?: string;
    logo: string;
    guidelines: GuidelineItem[];
};

// Icons
const Icons = {
    Close: () => h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [h('line', { x1: 18, y1: 6, x2: 6, y2: 18 }), h('line', { x1: 6, y1: 6, x2: 18, y2: 18 })]),
    ChevronLeft: () => h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [h('polyline', { points: '15 18 9 12 15 6' })]),
    ChevronRight: () => h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [h('polyline', { points: '9 18 15 12 9 6' })]),
    ZoomIn: () => h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [h('circle', { cx: 11, cy: 11, r: 8 }), h('line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }), h('line', { x1: 11, y1: 8, x2: 11, y2: 14 }), h('line', { x1: 8, y1: 11, x2: 14, y2: 11 })]),
    ZoomOut: () => h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [h('circle', { cx: 11, cy: 11, r: 8 }), h('line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }), h('line', { x1: 8, y1: 11, x2: 14, y2: 11 })]),
    Reset: () => h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [h('path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }), h('path', { d: 'M3 3v5h5' })]),
    List: () => h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [h('line', { x1: 8, y1: 6, x2: 21, y2: 6 }), h('line', { x1: 8, y1: 12, x2: 21, y2: 12 }), h('line', { x1: 8, y1: 18, x2: 21, y2: 18 }), h('line', { x1: 3, y1: 6, x2: 3.01, y2: 6 }), h('line', { x1: 3, y1: 12, x2: 3.01, y2: 12 }), h('line', { x1: 3, y1: 18, x2: 3.01, y2: 18 })]),
    ArrowRight: () => h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [h('line', { x1: 5, y1: 12, x2: 19, y2: 12 }), h('polyline', { points: '12 5 19 12 12 19' })])
};

export default defineComponent({
    name: 'GuidelinePage',
    props: {
        title: { type: String, default: 'Brand Guidelines' },
        subtitle: { type: String, default: 'Explore our brand standards and visual identity' },
        brands: { type: Array as PropType<BrandItem[]>, default: () => [] }
    },
    setup(props) {
        const selectedBrand = ref<BrandItem | null>(null);
        const currentGuidelineIndex = ref<number>(0);
        const isLoading = ref<boolean>(false);
        const isMenuOpen = ref<boolean>(false);
        const toastMessage = ref<string | null>(null);

        // Zoom & Pan State
        const zoomLevel = ref<number>(1);
        const panX = ref<number>(0);
        const panY = ref<number>(0);
        const isDragging = ref<boolean>(false);
        const lastMouseX = ref<number>(0);
        const lastMouseY = ref<number>(0);

        // Touch State
        const touchStartX = ref<number>(0);
        const touchEndX = ref<number>(0);

        const showToast = (message: string) => {
            toastMessage.value = message;
            setTimeout(() => {
                toastMessage.value = null;
            }, 2000);
        };

        const resetZoom = () => {
            zoomLevel.value = 1;
            panX.value = 0;
            panY.value = 0;
        };

        const preloadImages = (index: number) => {
            if (!selectedBrand.value) return;

            const urlsToPreload = [];
            if (index < selectedBrand.value.guidelines.length - 1) {
                urlsToPreload.push(selectedBrand.value.guidelines[index + 1].path);
            }
            if (index > 0) {
                urlsToPreload.push(selectedBrand.value.guidelines[index - 1].path);
            }

            urlsToPreload.forEach(url => {
                const img = new Image();
                img.src = url;
            });
        };

        const openBrand = (brand: BrandItem) => {
            selectedBrand.value = brand;
            currentGuidelineIndex.value = 0;
            resetZoom();
            isMenuOpen.value = false;
            preloadImages(0);
        };

        const closeBrand = () => {
            selectedBrand.value = null;
            currentGuidelineIndex.value = 0;
            resetZoom();
            isMenuOpen.value = false;
        };

        const loadGuideline = (index: number) => {
            if (!selectedBrand.value) return;
            isLoading.value = true;
            currentGuidelineIndex.value = index;
            resetZoom();
            isMenuOpen.value = false;

            // Preload adjacent images
            preloadImages(index);

            setTimeout(() => {
                isLoading.value = false;
            }, 300);
        };

        const nextGuideline = () => {
            if (selectedBrand.value && currentGuidelineIndex.value < selectedBrand.value.guidelines.length - 1) {
                loadGuideline(currentGuidelineIndex.value + 1);
            }
        };

        const prevGuideline = () => {
            if (currentGuidelineIndex.value > 0) {
                loadGuideline(currentGuidelineIndex.value - 1);
            }
        };

        // Zoom Controls
        const zoomIn = () => {
            if (zoomLevel.value < 3) zoomLevel.value += 0.5;
        };

        const zoomOut = () => {
            if (zoomLevel.value > 0.5) zoomLevel.value -= 0.5;
        };

        const toggleMenu = () => {
            isMenuOpen.value = !isMenuOpen.value;
        };

        // Pan Handlers
        const startPan = (e: MouseEvent) => {
            if (zoomLevel.value > 1) {
                isDragging.value = true;
                lastMouseX.value = e.clientX;
                lastMouseY.value = e.clientY;
                e.preventDefault();
            }
        };

        const doPan = (e: MouseEvent) => {
            if (isDragging.value) {
                const deltaX = e.clientX - lastMouseX.value;
                const deltaY = e.clientY - lastMouseY.value;
                panX.value += deltaX;
                panY.value += deltaY;
                lastMouseX.value = e.clientX;
                lastMouseY.value = e.clientY;
            }
        };

        const endPan = () => {
            isDragging.value = false;
        };

        // Touch Handlers (Swipe)
        const handleTouchStart = (e: TouchEvent) => {
            touchStartX.value = e.changedTouches[0].screenX;
        };

        const handleTouchEnd = (e: TouchEvent) => {
            touchEndX.value = e.changedTouches[0].screenX;
            handleSwipe();
        };

        const handleSwipe = () => {
            if (zoomLevel.value > 1) return;

            const threshold = 50;
            if (touchEndX.value < touchStartX.value - threshold) {
                nextGuideline();
            }
            if (touchEndX.value > touchStartX.value + threshold) {
                prevGuideline();
            }
        };

        const handleKeydown = (e: KeyboardEvent) => {
            if (!selectedBrand.value) return;

            if (e.key === 'Escape') {
                closeBrand();
            } else if (e.key === 'ArrowRight') {
                nextGuideline();
            } else if (e.key === 'ArrowLeft') {
                prevGuideline();
            } else if (e.key === '+' || e.key === '=') {
                zoomIn();
            } else if (e.key === '-') {
                zoomOut();
            } else if (e.key === '0') {
                resetZoom();
                showToast('Zoom Reset');
            } else if (e.key === 'm' || e.key === 'M') {
                toggleMenu();
            }
        };

        onMounted(() => {
            if (typeof window !== 'undefined') {
                window.addEventListener('keydown', handleKeydown);
                window.addEventListener('mouseup', endPan);
                window.addEventListener('mousemove', doPan);
            }
        });

        onUnmounted(() => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('keydown', handleKeydown);
                window.removeEventListener('mouseup', endPan);
                window.removeEventListener('mousemove', doPan);
            }
        });

        return () => {
            const currentGuideline = selectedBrand.value
                ? selectedBrand.value.guidelines[currentGuidelineIndex.value]
                : null;

            const progressPercentage = selectedBrand.value
                ? ((currentGuidelineIndex.value + 1) / selectedBrand.value.guidelines.length) * 100
                : 0;

            return h('div', { class: 'guideline-page' }, [
                // Header
                h('div', { class: 'guideline-header' }, [
                    h('h1', { class: 'guideline-title' }, props.title),
                    h('p', { class: 'guideline-subtitle' }, props.subtitle)
                ]),

                // Brand Grid
                h('div', { class: 'brand-grid' },
                    props.brands.map((brand) =>
                        h('div', {
                            key: brand.id,
                            class: 'brand-card',
                            onClick: () => openBrand(brand)
                        }, [
                            h('div', { class: 'brand-logo-container' }, [
                                h('img', {
                                    class: 'brand-logo',
                                    src: brand.logo,
                                    alt: brand.name,
                                    loading: 'lazy'
                                })
                            ]),
                            h('div', { class: 'brand-info' }, [
                                h('h3', { class: 'brand-name' }, brand.name),
                                brand.description ? h('p', { class: 'brand-description' }, brand.description) : null,
                                h('div', { class: 'brand-cta' }, [
                                    h('span', 'View Guidelines'),
                                    h('span', { class: 'cta-arrow' }, h(Icons.ArrowRight))
                                ])
                            ])
                        ])
                    )
                ),

                // SVG Viewer Modal
                selectedBrand.value ? h('div', {
                    class: 'svg-viewer-modal',
                    role: 'dialog',
                    'aria-modal': 'true',
                    'aria-label': 'Brand guidelines viewer',
                    onClick: (e: MouseEvent) => {
                        if ((e.target as HTMLElement).classList.contains('svg-viewer-modal')) {
                            closeBrand();
                        }
                    }
                }, [
                    // Progress Bar
                    h('div', { class: 'progress-bar-container' }, [
                        h('div', {
                            class: 'progress-bar-fill',
                            style: { width: `${progressPercentage}%` }
                        })
                    ]),

                    // Toast Notification
                    h('div', { class: ['toast-notification', { 'is-visible': toastMessage.value }] }, toastMessage.value),

                    h('div', { class: 'svg-viewer-container' }, [
                        // Close Button (Top Right)
                        h('button', {
                            class: 'close-viewer-button',
                            onClick: closeBrand,
                            'aria-label': 'Close viewer',
                            title: 'Close (Esc)'
                        }, h(Icons.Close)),

                        // SVG Display Area
                        h('div', {
                            class: ['svg-display', { 'is-zoomed': zoomLevel.value > 1 }],
                            onMousedown: startPan,
                            onTouchstart: handleTouchStart,
                            onTouchend: handleTouchEnd
                        }, [
                            isLoading.value ? h('div', { class: 'loading-spinner' }) : null,

                            currentGuideline ? h('div', {
                                class: 'svg-wrapper',
                                style: {
                                    transform: `scale(${zoomLevel.value}) translate(${panX.value}px, ${panY.value}px)`,
                                    cursor: zoomLevel.value > 1 ? (isDragging.value ? 'grabbing' : 'grab') : 'default'
                                }
                            }, [
                                h('img', {
                                    class: 'svg-image',
                                    src: currentGuideline.path,
                                    alt: currentGuideline.name,
                                    key: currentGuideline.path,
                                    onLoad: () => isLoading.value = false
                                })
                            ]) : null
                        ]),

                        // Floating Control Dock
                        h('div', { class: 'control-dock-container' }, [
                            // Custom Quick Nav Menu (Popover)
                            h('div', { class: ['quick-nav-menu', { 'is-open': isMenuOpen.value }] }, [
                                h('div', { class: 'quick-nav-header' }, 'Jump to page'),
                                h('div', { class: 'quick-nav-list' },
                                    selectedBrand.value.guidelines.map((g, index) =>
                                        h('button', {
                                            class: ['quick-nav-item', { 'is-active': currentGuidelineIndex.value === index }],
                                            onClick: () => loadGuideline(index)
                                        }, [
                                            h('span', { class: 'quick-nav-number' }, index + 1),
                                            h('span', { class: 'quick-nav-label' }, g.name)
                                        ])
                                    )
                                )
                            ]),

                            // Main Dock
                            h('div', { class: 'control-dock' }, [
                                // Prev Button
                                h('button', {
                                    class: 'dock-button',
                                    onClick: prevGuideline,
                                    disabled: currentGuidelineIndex.value === 0,
                                    title: 'Previous Page (Left Arrow)'
                                }, h(Icons.ChevronLeft)),

                                // Divider
                                h('div', { class: 'dock-divider' }),

                                // Page Info / Menu Trigger
                                h('button', {
                                    class: ['dock-info', { 'is-active': isMenuOpen.value }],
                                    onClick: toggleMenu,
                                    title: 'Toggle Page Menu (M)'
                                }, [
                                    h('span', { class: 'dock-page-text' }, `Page ${currentGuidelineIndex.value + 1}`),
                                    h('span', { class: 'dock-page-total' }, `/ ${selectedBrand.value.guidelines.length}`),
                                    h('div', { class: 'dock-menu-icon' }, h(Icons.List))
                                ]),

                                // Divider
                                h('div', { class: 'dock-divider' }),

                                // Zoom Controls
                                h('div', { class: 'dock-zoom-group' }, [
                                    h('button', {
                                        class: 'dock-button small',
                                        onClick: zoomOut,
                                        disabled: zoomLevel.value <= 0.5,
                                        title: 'Zoom Out (-)'
                                    }, h(Icons.ZoomOut)),

                                    h('button', {
                                        class: 'dock-button small',
                                        onClick: resetZoom,
                                        disabled: zoomLevel.value === 1,
                                        title: 'Reset Zoom (0)'
                                    }, h(Icons.Reset)),

                                    h('button', {
                                        class: 'dock-button small',
                                        onClick: zoomIn,
                                        disabled: zoomLevel.value >= 3,
                                        title: 'Zoom In (+)'
                                    }, h(Icons.ZoomIn))
                                ]),

                                // Divider
                                h('div', { class: 'dock-divider' }),

                                // Next Button
                                h('button', {
                                    class: 'dock-button',
                                    onClick: nextGuideline,
                                    disabled: currentGuidelineIndex.value === selectedBrand.value.guidelines.length - 1,
                                    title: 'Next Page (Right Arrow)'
                                }, h(Icons.ChevronRight))
                            ])
                        ])
                    ])
                ]) : null
            ]);
        };
    }
});
