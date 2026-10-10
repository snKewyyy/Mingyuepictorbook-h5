// app.js - 0928 产品目录画册交互引擎
(function() {
  const TOTAL_PAGES = 12;
  let currentIndex = 0;
  let hudTimer = null;
  let isZoomed = false;
  let isDrawerOpen = false;

  // DOM 元素
  const app = document.getElementById('app');
  const swiperWrapper = document.getElementById('swiper-wrapper');
  const currentPageText = document.getElementById('current-page-text');
  const totalPageText = document.getElementById('total-page-text');
  const progressBar = document.getElementById('hud-progress-bar');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const menuBtn = document.getElementById('menu-btn');
  const pageIndicatorBtn = document.getElementById('page-indicator-btn');
  const drawerOverlay = document.getElementById('drawer-overlay');
  const drawerContent = document.getElementById('drawer-content');
  const drawerCloseBtn = document.getElementById('drawer-close-btn');
  const drawerGrid = document.getElementById('drawer-grid');

  // 状态数组：每页保存当前 scale, posX, posY
  const pageStates = [];

  // 初始化数据与 DOM
  function init() {
    totalPageText.textContent = TOTAL_PAGES < 10 ? `0${TOTAL_PAGES}` : `${TOTAL_PAGES}`;
    
    // 生成幻灯片及抽屉缩略图
    for (let i = 1; i <= TOTAL_PAGES; i++) {
      const numStr = i < 10 ? `0${i}` : `${i}`;
      let label = numStr;
      if (i === 1) label = '封面';
      if (i === TOTAL_PAGES) label = '封底';

      pageStates.push({
        scale: 1,
        x: 0,
        y: 0,
        initialDistance: 0,
        initialScale: 1
      });

      // Slide DOM
      const slide = document.createElement('div');
      slide.className = 'swiper-slide';
      slide.innerHTML = `
        <div class="zoom-container" id="zoom-container-${i - 1}">
          <img class="catalog-img" src="./images/page_${numStr}.jpg" alt="Page ${i}" draggable="false" />
        </div>
      `;
      swiperWrapper.appendChild(slide);

      // Drawer Item DOM
      const thumb = document.createElement('div');
      thumb.className = `thumb-card ${i === 1 ? 'active-thumb' : ''}`;
      thumb.dataset.index = i - 1;
      thumb.innerHTML = `
        <div class="thumb-img-wrapper">
          <img class="thumb-img" src="./images/page_${numStr}.jpg" alt="Thumb ${i}" loading="lazy" />
          <div class="thumb-badge">${label}</div>
        </div>
        <span class="thumb-caption">第 ${i} 页</span>
      `;
      thumb.addEventListener('click', () => {
        goToPage(i - 1);
        closeDrawer();
      });
      drawerGrid.appendChild(thumb);
    }

    bindTouchGestures();
    bindUIEvents();
    updateUI();
    resetHudTimer();
  }

  // 更新 HUD 界面显示
  function updateUI() {
    const curStr = (currentIndex + 1) < 10 ? `0${currentIndex + 1}` : `${currentIndex + 1}`;
    currentPageText.textContent = curStr;
    const percent = ((currentIndex + 1) / TOTAL_PAGES) * 100;
    progressBar.style.width = `${percent}%`;

    // 翻页按键置灰
    if (currentIndex === 0) {
      prevBtn.classList.add('arrow-disabled');
    } else {
      prevBtn.classList.remove('arrow-disabled');
    }

    if (currentIndex === TOTAL_PAGES - 1) {
      nextBtn.classList.add('arrow-disabled');
    } else {
      nextBtn.classList.remove('arrow-disabled');
    }

    // 抽屉高亮
    const thumbs = drawerGrid.querySelectorAll('.thumb-card');
    thumbs.forEach((el, idx) => {
      if (idx === currentIndex) {
        el.classList.add('active-thumb');
      } else {
        el.classList.remove('active-thumb');
      }
    });
  }

  // 重置上一页的缩放位置
  function resetSlideZoom(idx) {
    const state = pageStates[idx];
    if (!state) return;
    state.scale = 1;
    state.x = 0;
    state.y = 0;
    const container = document.getElementById(`zoom-container-${idx}`);
    if (container) {
      container.style.transition = 'transform 0.25s ease-out';
      container.style.transform = `translate3d(0px, 0px, 0px) scale(1)`;
    }
  }

  // 翻页
  function goToPage(targetIdx) {
    if (targetIdx < 0 || targetIdx >= TOTAL_PAGES) return;
    if (targetIdx !== currentIndex) {
      resetSlideZoom(currentIndex);
      isZoomed = false;
      app.classList.remove('is-zoomed-mode');
    }
    currentIndex = targetIdx;
    swiperWrapper.style.transition = 'transform 0.28s cubic-bezier(0.25, 1, 0.5, 1)';
    swiperWrapper.style.transform = `translate3d(-${currentIndex * 100}vw, 0px, 0px)`;
    updateUI();
    resetHudTimer();
  }

  // 自动沉浸 HUD 计时器
  function resetHudTimer() {
    clearTimeout(hudTimer);
    if (!isZoomed && !isDrawerOpen) {
      app.classList.remove('hud-hidden');
      app.classList.add('hud-active');
      hudTimer = setTimeout(() => {
        if (!isDrawerOpen) {
          app.classList.remove('hud-active');
          app.classList.add('hud-hidden');
        }
      }, 3500);
    }
  }

  function toggleHud() {
    if (isZoomed) return;
    if (app.classList.contains('hud-hidden')) {
      resetHudTimer();
    } else {
      app.classList.remove('hud-active');
      app.classList.add('hud-hidden');
    }
  }

  // 抽屉控制
  function openDrawer() {
    isDrawerOpen = true;
    drawerOverlay.classList.add('drawer-open');
    clearTimeout(hudTimer);
    app.classList.remove('hud-hidden');
    app.classList.add('hud-active');
  }

  function closeDrawer() {
    isDrawerOpen = false;
    drawerOverlay.classList.remove('drawer-open');
    resetHudTimer();
  }

  // 触摸手势核心逻辑（单指翻页/拖拽，双指缩放，双击缩放）
  function bindTouchGestures() {
    let startX = 0, startY = 0;
    let deltaX = 0, deltaY = 0;
    let isTouching = false;
    let isPinching = false;
    let initialPinchDist = 0;
    let pinchStartScale = 1;
    let lastTapTime = 0;

    function getDistance(touch1, touch2) {
      const dx = touch1.clientX - touch2.clientX;
      const dy = touch1.clientY - touch2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    const stage = document.getElementById('swiper-stage');

    stage.addEventListener('touchstart', (e) => {
      // 唤醒 HUD
      resetHudTimer();

      if (e.touches.length === 1) {
        // 单指触摸
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        deltaX = 0;
        deltaY = 0;
        isTouching = true;

        // 双击放大检测
        const now = Date.now();
        if (now - lastTapTime < 300) {
          e.preventDefault();
          handleDoubleTap();
          lastTapTime = 0;
          return;
        }
        lastTapTime = now;

        const curState = pageStates[currentIndex];
        const container = document.getElementById(`zoom-container-${currentIndex}`);
        if (curState && curState.scale > 1.05 && container) {
          container.style.transition = 'none';
        }
      } else if (e.touches.length === 2) {
        // 双指捏合缩放
        isPinching = true;
        isTouching = false;
        initialPinchDist = getDistance(e.touches[0], e.touches[1]);
        const curState = pageStates[currentIndex];
        pinchStartScale = curState ? curState.scale : 1;
        const container = document.getElementById(`zoom-container-${currentIndex}`);
        if (container) container.style.transition = 'none';
      }
    }, { passive: false });

    stage.addEventListener('touchmove', (e) => {
      if (isPinching && e.touches.length === 2) {
        e.preventDefault();
        const dist = getDistance(e.touches[0], e.touches[1]);
        let nextScale = pinchStartScale * (dist / initialPinchDist);
        nextScale = Math.max(1, Math.min(4, nextScale));

        const curState = pageStates[currentIndex];
        curState.scale = nextScale;
        if (nextScale <= 1.05) {
          curState.x = 0;
          curState.y = 0;
          isZoomed = false;
          app.classList.remove('is-zoomed-mode');
        } else {
          isZoomed = true;
          app.classList.add('is-zoomed-mode');
        }
        const container = document.getElementById(`zoom-container-${currentIndex}`);
        if (container) {
          container.style.transform = `translate3d(${curState.x}px, ${curState.y}px, 0px) scale(${curState.scale})`;
        }
      } else if (isTouching && e.touches.length === 1) {
        const touch = e.touches[0];
        deltaX = touch.clientX - startX;
        deltaY = touch.clientY - startY;

        const curState = pageStates[currentIndex];
        if (curState && curState.scale > 1.05) {
          // 放大状态下自由向各方位平移拖拽，拦截翻页
          e.preventDefault();
          const nextX = curState.x + deltaX * 0.9;
          const nextY = curState.y + deltaY * 0.9;
          const container = document.getElementById(`zoom-container-${currentIndex}`);
          if (container) {
            container.style.transform = `translate3d(${nextX}px, ${nextY}px, 0px) scale(${curState.scale})`;
          }
        } else {
          // 正常 1x 状态下横向滑动指示
          if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
            e.preventDefault();
            const offset = -currentIndex * window.innerWidth + deltaX * 0.65;
            swiperWrapper.style.transition = 'none';
            swiperWrapper.style.transform = `translate3d(${offset}px, 0px, 0px)`;
          }
        }
      }
    }, { passive: false });

    stage.addEventListener('touchend', (e) => {
      const curState = pageStates[currentIndex];
      const container = document.getElementById(`zoom-container-${currentIndex}`);

      if (isPinching) {
        if (e.touches.length < 2) {
          isPinching = false;
          if (curState && curState.scale <= 1.05) {
            resetSlideZoom(currentIndex);
            isZoomed = false;
            app.classList.remove('is-zoomed-mode');
          }
        }
      } else if (isTouching) {
        isTouching = false;
        if (curState && curState.scale > 1.05) {
          // 更新平移落点并增加顺滑弹性限制
          curState.x += deltaX * 0.9;
          curState.y += deltaY * 0.9;
          // 边界回弹限制
          const maxShiftX = (window.innerWidth * (curState.scale - 1)) / 2;
          const maxShiftY = (window.innerHeight * (curState.scale - 1)) / 2;
          curState.x = Math.max(-maxShiftX, Math.min(maxShiftX, curState.x));
          curState.y = Math.max(-maxShiftY, Math.min(maxShiftY, curState.y));
          if (container) {
            container.style.transition = 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)';
            container.style.transform = `translate3d(${curState.x}px, ${curState.y}px, 0px) scale(${curState.scale})`;
          }
        } else {
          // 滑动切换页面判定
          const threshold = window.innerWidth * 0.16;
          if (deltaX < -threshold && currentIndex < TOTAL_PAGES - 1) {
            goToPage(currentIndex + 1);
          } else if (deltaX > threshold && currentIndex > 0) {
            goToPage(currentIndex - 1);
          } else {
            // 滑动未达到阈值，回弹
            swiperWrapper.style.transition = 'transform 0.24s ease-out';
            swiperWrapper.style.transform = `translate3d(-${currentIndex * 100}vw, 0px, 0px)`;
          }
        }
      }
    });

    // 双击快速放大/复位
    function handleDoubleTap() {
      const curState = pageStates[currentIndex];
      const container = document.getElementById(`zoom-container-${currentIndex}`);
      if (!curState || !container) return;

      container.style.transition = 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
      if (curState.scale > 1.1) {
        // 复原
        curState.scale = 1;
        curState.x = 0;
        curState.y = 0;
        isZoomed = false;
        app.classList.remove('is-zoomed-mode');
        container.style.transform = `translate3d(0px, 0px, 0px) scale(1)`;
      } else {
        // 放大至 2.4x
        curState.scale = 2.4;
        curState.x = 0;
        curState.y = 0;
        isZoomed = true;
        app.classList.add('is-zoomed-mode');
        container.style.transform = `translate3d(0px, 0px, 0px) scale(2.4)`;
      }
    }

    // 单击舞台区域切换 HUD 显示
    stage.addEventListener('click', (e) => {
      // 避免误触
      if (Math.abs(deltaX) < 5 && Math.abs(deltaY) < 5) {
        toggleHud();
      }
    });
  }

  // 绑定常规按键及事件
  function bindUIEvents() {
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentIndex > 0) goToPage(currentIndex - 1);
    });

    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentIndex < TOTAL_PAGES - 1) goToPage(currentIndex + 1);
    });

    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDrawer();
    });

    pageIndicatorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDrawer();
    });

    drawerCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeDrawer();
    });

    drawerOverlay.addEventListener('click', (e) => {
      if (e.target === drawerOverlay) {
        closeDrawer();
      }
    });

    drawerContent.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // 键盘支持 (PC端浏览支持左右键)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        if (currentIndex < TOTAL_PAGES - 1) goToPage(currentIndex + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        if (currentIndex > 0) goToPage(currentIndex - 1);
      } else if (e.key === 'Escape') {
        closeDrawer();
      }
    });
  }

  // 启动初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
