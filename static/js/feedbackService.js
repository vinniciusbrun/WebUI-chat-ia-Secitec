export async function sendFeedback(messageContent, type) {
    try {
        const response = await fetch('/api/feedback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: messageContent,
                feedback_type: type
            })
        });

        if (!response.ok) {
            throw new Error('Failed to send feedback');
        }

        return await response.json();
    } catch (error) {
        console.error('Error sending feedback:', error);
        throw error;
    }
}