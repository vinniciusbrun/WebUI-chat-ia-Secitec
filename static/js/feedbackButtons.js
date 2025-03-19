import { sendFeedback } from './feedbackService.js';

export function createFeedbackButtons(message, messageContent) {
  const feedbackContainer = document.createElement('div');
  feedbackContainer.className = 'feedback-container visible';  // Tornar visível por padrão

  const likeButton = createButton('like', `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M7 10v12"/>
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/>
    </svg>
  `);

  const dislikeButton = createButton('dislike', `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17 14V2"/>
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z"/>
    </svg>
  `);

  feedbackContainer.appendChild(likeButton);
  feedbackContainer.appendChild(dislikeButton);
  return feedbackContainer;
}

function createButton(type, svgContent) {
  const button = document.createElement('button');
  button.className = `feedback-button ${type}-button`;
  button.innerHTML = svgContent;
  button.addEventListener('click', async () => {
    try {
      await handleFeedback(type, button);
    } catch (error) {
      showNotification('error');
    }
  });
  return button;
}

async function handleFeedback(type, button) {
    const container = button.parentElement;
    const message = container.closest('.message.ai');
    if (!message) {
        showNotification('error', 'Message not found');
        return;
    }
    
    const messageContent = message.querySelector('.message-content')?.textContent;
    if (!messageContent) {
        showNotification('error', 'Message content not found');
        return;
    }

    // Disable buttons during processing
    const buttons = container.querySelectorAll('.feedback-button');
    buttons.forEach(btn => btn.disabled = true);

    try {
        await sendFeedback(messageContent, type);
        
        // Update button states
        buttons.forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('active');
        });
        button.classList.add('active');

        showNotification('success', type);
    } catch (error) {
        buttons.forEach(btn => btn.disabled = false);
        showNotification('error', error.message || 'Failed to send feedback');
    }
}

function showNotification(status, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${status}`;
    
    if (status === 'success') {
        notification.textContent = type === 'like' ? 
            'Feedback positivo recebido!' : 
            'Feedback negativo recebido!';
    } else {
        notification.textContent = type;
    }

    document.body.appendChild(notification);
    requestAnimationFrame(() => notification.classList.add('show'));

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}