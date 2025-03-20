import threading
import time
import logging
import queue
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Callable, Generator
import concurrent.futures

# Configuração de logging
logger = logging.getLogger(__name__)

# Classe para gerenciar requisições com prioridade
@dataclass(order=True)
class PrioritizedRequest:
    priority: int
    session_id: str = field(compare=False)
    message: str = field(compare=False)
    timestamp: float = field(compare=False)
    result_queue: queue.Queue = field(compare=False)
    model_name: str = field(compare=False)
    profile_id: str = field(compare=False)

class ResourceManager:
    """
    Gerenciador de recursos para processamento assíncrono de requisições
    e isolamento de contexto entre sessões.
    """
    
    def __init__(self, 
                 model_pool_size=2, 
                 max_workers=4, 
                 session_timeout=1800):
        """
        Inicializa o gerenciador de recursos.
        
        Args:
            model_pool_size: Número máximo de instâncias do modelo em paralelo
            max_workers: Número máximo de workers para processamento assíncrono
            session_timeout: Tempo em segundos para timeout de sessões inativas
        """
        # Fila de requisições com prioridade
        self.request_queue = queue.PriorityQueue()
        
        # Semáforo para controlar o pool de modelos
        self.model_pool_semaphore = threading.Semaphore(model_pool_size)
        
        # Executor para processamento assíncrono
        self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=max_workers)
        
        # Controle de sessões
        self.session_contexts = {}
        self.session_lock = threading.RLock()
        self.session_timeout = session_timeout
        
        # Controle de processamento
        self.is_processing_active = True
        self.processing_workers = []
        
        # Iniciar workers
        self._start_workers()
        
    def _start_workers(self):
        """Inicia os workers para processamento de requisições e limpeza de sessões"""
        # Worker para processar requisições
        request_worker = threading.Thread(
            target=self._process_request_queue,
            daemon=True
        )
        request_worker.start()
        self.processing_workers.append(request_worker)
        
        # Worker para limpar sessões inativas
        cleanup_worker = threading.Thread(
            target=self._cleanup_old_sessions,
            daemon=True
        )
        cleanup_worker.start()
        self.processing_workers.append(cleanup_worker)
        
        logger.info("Workers de processamento iniciados")
    
    def get_session_context(self, session_id, model_name, profile_id):
        """
        Obtém ou cria um contexto de sessão com bloqueio adequado.
        
        Args:
            session_id: ID da sessão
            model_name: Nome do modelo a ser usado
            profile_id: ID do perfil a ser usado
            
        Returns:
            Dict: Contexto da sessão
        """
        with self.session_lock:
            if session_id not in self.session_contexts:
                self.session_contexts[session_id] = {
                    'history': [],
                    'last_access': time.time(),
                    'model': model_name,
                    'profile': profile_id,
                    'processing': False,
                    'gpu_usage': 0.0  # Uso estimado de GPU (0.0 - 1.0)
                }
            else:
                # Atualizar timestamp de último acesso
                self.session_contexts[session_id]['last_access'] = time.time()
                # Atualizar modelo e perfil se necessário
                self.session_contexts[session_id]['model'] = model_name
                self.session_contexts[session_id]['profile'] = profile_id
            
            return self.session_contexts[session_id]
    
    def _cleanup_old_sessions(self):
        """Remove contextos de sessão que não foram acessados por um tempo"""
        while self.is_processing_active:
            try:
                current_time = time.time()
                with self.session_lock:
                    # Encontrar sessões mais antigas que o timeout
                    old_sessions = [
                        sid for sid, context in self.session_contexts.items()
                        if current_time - context['last_access'] > self.session_timeout
                    ]
                    
                    # Remover sessões antigas
                    for sid in old_sessions:
                        logger.info(f"Limpando sessão inativa: {sid}")
                        del self.session_contexts[sid]
            except Exception as e:
                logger.error(f"Erro na limpeza de sessões: {str(e)}")
            
            # Verificar a cada 5 minutos
            time.sleep(300)
    
    def _process_request_queue(self):
        """Processa requisições da fila com tratamento de prioridade"""
        while self.is_processing_active:
            try:
                # Obter a próxima requisição com maior prioridade
                if self.request_queue.empty():
                    time.sleep(0.1)  # Pequeno sleep para evitar CPU spinning
                    continue
                    
                request = self.request_queue.get()
                
                # Processar a requisição
                logger.info(f"Processando requisição para sessão {request.session_id} (prioridade: {request.priority})")
                
                # Adquirir um modelo do pool
                with self.model_pool_semaphore:
                    # Obter o contexto da sessão
                    context = self.get_session_context(
                        request.session_id, 
                        request.model_name,
                        request.profile_id
                    )
                    context['processing'] = True
                    
                    try:
                        # Submeter a tarefa para o executor
                        future = self.executor.submit(
                            self._process_request,
                            request
                        )
                        
                        # Aguardar conclusão (sem bloquear o thread principal)
                        future.add_done_callback(
                            lambda f: self._handle_request_completion(f, request.session_id)
                        )
                    except Exception as e:
                        logger.error(f"Erro ao submeter requisição: {str(e)}")
                        request.result_queue.put(f"Erro: {str(e)}")
                        request.result_queue.put(None)  # Sinal de conclusão
                        context['processing'] = False
                        
                # Marcar a requisição como concluída na fila
                self.request_queue.task_done()
                
            except Exception as e:
                logger.error(f"Erro no processamento da fila de requisições: {str(e)}")
                time.sleep(1)  # Evitar loop apertado em caso de erro
    
    def _process_request(self, request):
        """
        Processa uma requisição individual.
        Esta função deve ser sobrescrita pela aplicação.
        
        Args:
            request: A requisição a ser processada
            
        Returns:
            Generator: Um gerador que produz chunks de resposta
        """
        # Esta é uma implementação de placeholder
        # A aplicação real deve substituir esta função
        yield "Processamento não implementado"
        yield None  # Sinal de conclusão
    
    def _handle_request_completion(self, future, session_id):
        """Manipula a conclusão de uma requisição"""
        try:
            # Marcar a sessão como não mais em processamento
            with self.session_lock:
                if session_id in self.session_contexts:
                    self.session_contexts[session_id]['processing'] = False
                    self.session_contexts[session_id]['gpu_usage'] = 0.0
        except Exception as e:
            logger.error(f"Erro ao finalizar requisição: {str(e)}")
    
    def enqueue_request(self, session_id, message, model_name, profile_id):
        """
        Enfileira uma requisição para processamento.
        
        Args:
            session_id: ID da sessão
            message: Mensagem a ser processada
            model_name: Nome do modelo a ser usado
            profile_id: ID do perfil a ser usado
            
        Returns:
            queue.Queue: Fila para receber os resultados
        """
        # Criar uma fila para os resultados
        result_queue = queue.Queue()
        
        # Determinar a prioridade da requisição (número menor = prioridade maior)
        priority = 5  # Prioridade padrão
        
        with self.session_lock:
            if session_id in self.session_contexts:
                # Sessão existente recebe prioridade maior
                priority = 3
                # Se esta sessão já estiver sendo processada, dar prioridade ainda maior
                if self.session_contexts[session_id].get('processing', False):
                    priority = 1
        
        # Criar e enfileirar a requisição
        request = PrioritizedRequest(
            priority=priority,
            session_id=session_id,
            message=message,
            timestamp=time.time(),
            result_queue=result_queue,
            model_name=model_name,
            profile_id=profile_id
        )
        
        self.request_queue.put(request)
        logger.info(f"Requisição enfileirada para sessão {session_id} com prioridade {priority}")
        
        return result_queue
    
    def get_queue_status(self):
        """
        Obtém o status atual da fila de requisições.
        
        Returns:
            Dict: Status da fila
        """
        return {
            "queue_size": self.request_queue.qsize(),
            "active_sessions": len(self.session_contexts),
            "model_pool_available": self.model_pool_semaphore._value
        }
    
    def shutdown(self):
        """Desliga o gerenciador de recursos"""
        self.is_processing_active = False
        self.executor.shutdown(wait=False)
        logger.info("Gerenciador de recursos desligado")

# Função para estimar o uso de GPU com base no tamanho da mensagem e parâmetros
def estimate_gpu_usage(message_length, model_complexity=1.0):
    """
    Estima o uso de GPU com base no tamanho da mensagem e complexidade do modelo.
    
    Args:
        message_length: Comprimento da mensagem
        model_complexity: Fator de complexidade do modelo (1.0 = normal)
        
    Returns:
        float: Uso estimado de GPU (0.0 - 1.0)
    """
    # Fórmula simples para estimar uso de GPU
    # Pode ser ajustada com base em benchmarks reais
    base_usage = 0.2  # Uso base
    message_factor = min(0.6, message_length / 10000)  # Fator baseado no tamanho da mensagem
    
    return min(1.0, base_usage + message_factor * model_complexity)