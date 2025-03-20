from flask import Flask, render_template, request, Response, stream_with_context, jsonify
import traceback  # Adicione esta linha no início do arquivo junto com os outros imports
import json
import requests
import logging
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry
import os
import uuid  # Adicione esta importação
import threading  # Adicionar importação do threading
import time  # Já está importado mais abaixo, mas é melhor ter aqui também

# Importar o gerenciador de recursos
from resource_manager import ResourceManager, PrioritizedRequest, estimate_gpu_usage

# Configurações de logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configurar Flask
app = Flask(__name__, 
           static_url_path='/static',
           template_folder='templates',
           static_folder='static')

# Adicionar chave secreta para gerenciar sessões
app.secret_key = os.urandom(24)  # Gera uma chave secreta aleatória

# Replace the profile loading code at the beginning of the file
try:
    # Ensure config directory exists
    config_dir = os.path.join(os.path.dirname(__file__), 'config')
    if not os.path.exists(config_dir):
        os.makedirs(config_dir)
    
    # Carregar perfis do JSON
    profiles_path = os.path.join(config_dir, 'profiles.json')
    
    # Create default profile if file doesn't exist
    if not os.path.exists(profiles_path):
        default_profiles = {
            "default": {
                "name": "Assistente Padrão",
                "description": "Um assistente de IA geral e útil.",
                "prompt_template": "Você é um assistente de IA útil, honesto e inofensivo.",
                "parameters": {
                    "temperature": 0.7,
                    "top_p": 0.9,
                    "num_predict": 1024
                }
            }
        }
        with open(profiles_path, 'w', encoding='utf-8') as f:
            json.dump(default_profiles, f, ensure_ascii=False, indent=4)
        logger.info("Arquivo profiles.json criado com perfil padrão")
        PROMPT_PROFILES = default_profiles
    else:
        # Load existing profiles
        with open(profiles_path, 'r', encoding='utf-8') as f:
            PROMPT_PROFILES = json.load(f)
        logger.info(f"Perfis carregados: {list(PROMPT_PROFILES.keys())}")
    
    current_profile = "default"
except Exception as e:
    logger.error(f"Erro ao carregar perfis: {str(e)}")
    PROMPT_PROFILES = {
        "default": {
            "name": "Assistente Padrão",
            "description": "Um assistente de IA geral e útil.",
            "prompt_template": "Você é um assistente de IA útil, honesto e inofensivo.",
            "parameters": {
                "temperature": 0.7,
                "top_p": 0.9,
                "num_predict": 1024
            }
        }
    }
    current_profile = "default"
except FileNotFoundError:
    logger.error("Arquivo profiles.json não encontrado")
    PROMPT_PROFILES = {}
    current_profile = "default"
except json.JSONDecodeError:
    logger.error("Erro ao decodificar profiles.json")
    PROMPT_PROFILES = {}
    current_profile = "default"

# Configurações do Ollama
OLLAMA_URL = "http://127.0.0.1:11434"
DEFAULT_MODEL = "qwen2.5"
current_model = DEFAULT_MODEL
MAX_MESSAGE_LENGTH = 4000  # Limite razoável para mensagens
# Modificar a constante MAX_HISTORY_MESSAGES para 5
MAX_HISTORY_MESSAGES = 5  # Número máximo de mensagens no histórico (aumentado de 2 para 5)

# Remover esta linha que está causando o erro
# messages = chat_histories[session_id][-MAX_HISTORY_MESSAGES:] if len(chat_histories[session_id]) > MAX_HISTORY_MESSAGES else chat_histories[session_id]

# Configurar sessão HTTP com retry otimizado
session = requests.Session()
retry_strategy = Retry(
    total=2,
    backoff_factor=0.3,  # Reduzido para retentativas mais rápidas
    status_forcelist=[500, 502, 503, 504],
    allowed_methods=["GET", "POST"]
)
adapter = HTTPAdapter(
    max_retries=retry_strategy, 
    pool_connections=30,  # Aumentado de 20
    pool_maxsize=30,      # Aumentado de 20
    pool_block=False      # Não bloquear quando o pool estiver esgotado
)
session.mount("http://", adapter)

# Lista global para armazenar o histórico da conversa
chat_history = []



# Função para obter os modelos disponíveis no Ollama
# Modificar a função get_available_models para retornar também o modelo padrão
def get_available_models():
    try:
        logger.info(f"Tentando conectar ao Ollama em: {OLLAMA_URL}/api/tags")
        response = session.get(f"{OLLAMA_URL}/api/tags")
        if response.status_code == 200:
            models_data = response.json()
            # Extrai apenas os nomes dos modelos da resposta
            available_models = [model['name'] for model in models_data.get('models', [])]
            logger.info(f"Modelos obtidos com sucesso: {available_models}")
            
            # Determinar o modelo padrão (primeiro da lista)
            default_model = available_models[0] if available_models else DEFAULT_MODEL
            
            return available_models, default_model
        else:
            logger.error(f"Erro ao obter modelos: {response.status_code}, resposta: {response.text}")
            return [], DEFAULT_MODEL
    except Exception as e:
        logger.error(f"Erro ao conectar com Ollama: {str(e)}")
        return [], DEFAULT_MODEL

# Modificar a função is_model_available para usar a nova função get_available_models
def is_model_available(model_name):
    try:
        logger.info(f"Verificando se o modelo {model_name} está disponível...")
        available_models, _ = get_available_models()
        
        # Verificar se o modelo está na lista ou se algum modelo começa com o nome especificado
        for model in available_models:
            if model == model_name or model.startswith(f"{model_name}:"):
                logger.info(f"Modelo {model_name} está disponível como {model}")
                return True, model
                
        logger.warning(f"Modelo {model_name} não está disponível")
        return False, None
    except Exception as e:
        logger.error(f"Erro ao verificar disponibilidade do modelo: {str(e)}")
        return False, None

# Modificar a rota de modelos para usar a nova função
@app.route('/api/models', methods=['GET'])
def get_models():
    models, default_model = get_available_models()
    logger.info(f"Modelos disponíveis: {models}")
    return jsonify({
        'models': models,
        'current': current_model
    })

# Adicionar uma função para pré-aquecer o modelo com uma mensagem simples
def warmup_model_with_greeting(model_name):
    try:
        logger.info(f"Pré-aquecendo o modelo {model_name} com uma mensagem complexa...")
        
        # Mensagem simplificada mas ainda eficaz
        warmup_messages = [
            {"role": "system", "content": "Você é um assistente de IA útil."},
            {"role": "user", "content": "Olá, como você está?"}
        ]
        
        # Otimizar opções para aquecimento mais rápido
        response = session.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": model_name,
                "messages": warmup_messages,
                "stream": False,
                "options": {
                    "num_predict": 50,     # Reduzido de 100
                    "num_thread": 6,       # Aumentado de 4
                    "num_gpu": 1,
                    "num_batch": 12        # Aumentado de 8
                }
            },
            timeout=(10, 30)  # Timeout reduzido para resposta mais rápida
        )
    
        
        if response.status_code == 200:
            logger.info(f"Modelo {model_name} pré-aquecido com sucesso e pronto para uso")
            return True
        else:
            logger.warning(f"Falha ao pré-aquecer o modelo: {response.status_code}")
            return False
    except Exception as e:
        logger.warning(f"Erro ao pré-aquecer o modelo: {str(e)}")
        return False

# Add these routes after the existing routes but before the if __name__ == '__main__' block


@app.route('/api/profiles', methods=['GET'])
def get_profiles():
    """Retornar todos os perfis disponíveis"""
    try:
        logger.info(f"Retornando {len(PROMPT_PROFILES)} perfis")
        return jsonify(PROMPT_PROFILES)
    except Exception as e:
        logger.error(f"Erro ao obter perfis: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/profiles/add', methods=['POST'])
def add_profile():
    """Adicionar um novo perfil"""
    global PROMPT_PROFILES
    
    try:
        data = request.json
        if not data:
            return jsonify({"error": "Dados não fornecidos"}), 400
            
        profile_id = data.get('id')
        if not profile_id:
            return jsonify({"error": "ID do perfil não fornecido"}), 400
            
        # Criar novo perfil
        PROMPT_PROFILES[profile_id] = {
            "name": data.get('name', 'Perfil sem nome'),
            "description": data.get('description', ''),
            "prompt_template": data.get('prompt_template', ''),
            "parameters": data.get('parameters', {
                "temperature": 0.7,
                "top_p": 0.9,
                "top_k": 50,
                "repeat_penalty": 1.1
            })
        }
        
        # Salvar perfis no arquivo
        save_profiles()
        
        logger.info(f"Perfil '{profile_id}' adicionado com sucesso")
        return jsonify({"status": "success", "message": "Perfil adicionado com sucesso"})
    except Exception as e:
        logger.error(f"Erro ao adicionar perfil: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/profiles/update', methods=['POST'])
def update_profile():
    """Atualizar um perfil existente"""
    global PROMPT_PROFILES
    
    try:
        data = request.json
        if not data:
            return jsonify({"error": "Dados não fornecidos"}), 400
            
        profile_id = data.get('id')
        if not profile_id:
            return jsonify({"error": "ID do perfil não fornecido"}), 400
            
        # Verificar se o perfil existe
        if profile_id not in PROMPT_PROFILES:
            return jsonify({"error": f"Perfil com ID '{profile_id}' não encontrado"}), 404
            
        # Atualizar perfil
        PROMPT_PROFILES[profile_id] = {
            "name": data.get('name', PROMPT_PROFILES[profile_id].get('name', 'Perfil sem nome')),
            "description": data.get('description', PROMPT_PROFILES[profile_id].get('description', '')),
            "prompt_template": data.get('prompt_template', PROMPT_PROFILES[profile_id].get('prompt_template', '')),
            "parameters": data.get('parameters', PROMPT_PROFILES[profile_id].get('parameters', {
                "temperature": 0.7,
                "top_p": 0.9,
                "top_k": 50,
                "repeat_penalty": 1.1
            }))
        }
        
        # Salvar perfis no arquivo
        save_profiles()
        
        logger.info(f"Perfil '{profile_id}' atualizado com sucesso")
        return jsonify({"status": "success", "message": "Perfil atualizado com sucesso"})
    except Exception as e:
        logger.error(f"Erro ao atualizar perfil: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/profiles/delete', methods=['POST'])
def delete_profile():
    """Excluir um perfil"""
    global PROMPT_PROFILES, current_profile
    
    try:
        data = request.json
        if not data:
            return jsonify({"error": "Dados não fornecidos"}), 400
            
        profile_id = data.get('id')
        if not profile_id:
            return jsonify({"error": "ID do perfil não fornecido"}), 400
            
        # Verificar se o perfil existe
        if profile_id not in PROMPT_PROFILES:
            return jsonify({"error": f"Perfil com ID '{profile_id}' não encontrado"}), 404
            
        # Não permitir excluir o perfil padrão
        if profile_id == "default":
            return jsonify({"error": "Não é possível excluir o perfil padrão"}), 403
            
        # Se o perfil atual for excluído, voltar para o perfil padrão
        if profile_id == current_profile:
            current_profile = "default"
            
        # Excluir perfil
        del PROMPT_PROFILES[profile_id]
        
        # Salvar perfis no arquivo
        save_profiles()
        
        logger.info(f"Perfil '{profile_id}' excluído com sucesso")
        return jsonify({"status": "success", "message": "Perfil excluído com sucesso"})
    except Exception as e:
        logger.error(f"Erro ao excluir perfil: {str(e)}")
        return jsonify({"error": str(e)}), 500

def save_profiles():
    """Salvar perfis no arquivo JSON"""
    try:
        profiles_path = os.path.join(os.path.dirname(__file__), 'config', 'profiles.json')
        with open(profiles_path, 'w', encoding='utf-8') as f:
            json.dump(PROMPT_PROFILES, f, ensure_ascii=False, indent=4)
        logger.info("Perfis salvos com sucesso")
        return True
    except Exception as e:
        logger.error(f"Erro ao salvar perfis: {str(e)}")
        return False

@app.route('/api/profiles/current', methods=['GET'])
def get_current_profile():
    """Return the current profile"""
    try:
        return jsonify({"current": current_profile})
    except Exception as e:
        logger.error(f"Error getting current profile: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/profiles/select', methods=['POST'])
def select_profile():
    """Select a profile to use"""
    global current_profile
    
    try:
        profile_id = request.json.get('profile')
        if not profile_id:
            return jsonify({"status": "error", "error": "No profile specified"}), 400
            
        if profile_id not in PROMPT_PROFILES:
            return jsonify({"status": "error", "error": f"Profile {profile_id} not found"}), 404
            
        current_profile = profile_id
        logger.info(f"Selected profile: {profile_id}")
        
        # Return success with welcome message
        return jsonify({
            "status": "success", 
            "welcome_message": f"Perfil alterado para: {PROMPT_PROFILES[profile_id]['name']}"
        })
    except Exception as e:
        logger.error(f"Error selecting profile: {str(e)}")
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route('/api/models/select', methods=['POST'])
def select_model():
    """Select a model to use"""
    global current_model
    
    try:
        model_name = request.json.get('model')
        if not model_name:
            return jsonify({"status": "error", "error": "No model specified"}), 400
            
        # Check if model is available
        is_available, actual_model = is_model_available(model_name)
        
        if not is_available:
            return jsonify({
                "status": "error", 
                "error": f"Model {model_name} is not available"
            }), 404
            
        # Update current model
        current_model = actual_model
        logger.info(f"Selected model: {current_model}")
        
        # Pre-warm the model
        warmup_thread = threading.Thread(
            target=warmup_model_with_greeting, 
            args=(current_model,), 
            daemon=True
        )
        warmup_thread.start()
        
        # Return success with welcome message and the model name
        return jsonify({
            "status": "success", 
            "welcome_message": f"Modelo alterado para: {current_model}",
            "model": current_model  # Add this line to return the model name
        })
    except Exception as e:
        logger.error(f"Error selecting model: {str(e)}")
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route('/api/feedback', methods=['POST'])
def submit_feedback():
    """Submit user feedback"""
    try:
        message = request.json.get('message')
        feedback_type = request.json.get('feedback_type')
        
        if not message or not feedback_type:
            return jsonify({"status": "error", "error": "Mensagem ou tipo de feedback não fornecido"}), 400
            
        # Validar o tipo de feedback
        if feedback_type not in ['like', 'dislike']:
            return jsonify({"status": "error", "error": "Tipo de feedback inválido"}), 400
            
        # Aqui você pode salvar o feedback em um banco de dados ou arquivo
        # Por enquanto, apenas registramos no log
        logger.info(f"Feedback recebido: {feedback_type} para mensagem: {message[:50]}...")
        
        # Criar diretório de feedback se não existir
        feedback_dir = os.path.join(os.path.dirname(__file__), 'feedback')
        if not os.path.exists(feedback_dir):
            os.makedirs(feedback_dir)
            
        # Salvar feedback em um arquivo
        timestamp = time.strftime("%Y%m%d-%H%M%S")
        feedback_file = os.path.join(feedback_dir, f"feedback_{timestamp}_{feedback_type}.txt")
        
        with open(feedback_file, 'w', encoding='utf-8') as f:
            f.write(f"Tipo: {feedback_type}\n")
            f.write(f"Data: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Mensagem:\n{message}")
            
        return jsonify({"status": "success", "message": "Feedback recebido com sucesso"})
    except Exception as e:
        logger.error(f"Erro ao processar feedback: {str(e)}")
        return jsonify({"status": "error", "error": str(e)}), 500

# Add these variables globally after the warmup_model_with_greeting function
last_activity_time = time.time()
last_warmup_time = time.time()
warmup_lock = threading.Lock()

# Add the keep_model_warm function before it's used
def keep_model_warm():
    """Função para manter o modelo aquecido com requisições periódicas apenas quando necessário"""
    global last_activity_time, last_warmup_time
    
    while True:
        try:
            # Verifica se houve atividade recente (últimos 15 minutos)
            with warmup_lock:
                current_time = time.time()
                time_since_last_activity = current_time - last_activity_time
                time_since_last_warmup = current_time - last_warmup_time
                
                # Só pré-carrega se:
                # 1. Houve atividade recente (últimos 15 minutos)
                # 2. O útimo warmup foi há mais de 10 minutos
                if time_since_last_activity < 900 and time_since_last_warmup > 600:
                    logger.info(f"Realizando warmup periódico (última atividade há {time_since_last_activity:.1f}s, último warmup há {time_since_last_warmup:.1f}s)")
                    warmup_model_with_greeting(current_model)
                    last_warmup_time = time.time()  # Atualiza o timestamp do último warmup
                else:
                    if time_since_last_activity >= 900:
                        logger.info(f"Pulando warmup periódico (inatividade de {time_since_last_activity:.1f}s)")
                    else:
                        logger.info(f"Pulando warmup periódico (útimo warmup há apenas {time_since_last_warmup:.1f}s)")
        except Exception as e:
            logger.warning(f"Erro no warmup periódico: {str(e)}")
            
        time.sleep(300)  # 5 minutos

# Move the index route before the if __name__ == '__main__' block
@app.route('/')
def index():
    """Serve the main page of the application"""
    try:
        logger.info("Serving index page")
        return render_template('index.html')
    except Exception as e:
        logger.error(f"Error serving index page: {str(e)}")
        return f"Error loading the page: {str(e)}", 500

        

@app.route('/profile-manager')
def profile_manager():
    """Serve the profile manager page"""
    try:
        logger.info("Serving profile manager page")
        return render_template('profile-manager.html')
    except Exception as e:
        logger.error(f"Error serving profile manager page: {str(e)}")
        return f"Error loading the profile manager page: {str(e)}", 500

# Dictionary to store chat histories for different sessions
chat_histories = {}

# Function to format LaTeX content
def format_latex(text):
    """Format LaTeX content in the text"""
    # Simple implementation - you can enhance this as needed
    return text



#Estratégia para lidar com o contexto mais eficiente
def optimize_chat_history(messages, max_tokens=4000):
    """Otimiza o histórico do chat para manter dentro do limite de tokens"""
    # Esta é uma estimativa simples - 1 token ~= 4 caracteres em línguas ocidentais
    total_chars = sum(len(msg.get('content', '')) for msg in messages)
    estimated_tokens = total_chars / 4
    
    # Se estamos abaixo do limite, não há necessidade de otimização
    if estimated_tokens <= max_tokens:
        return messages
    
    # Preservar a mensagem do sistema e a última mensagem do usuário
    system_message = next((msg for msg in messages if msg.get('role') == 'system'), None)
    user_messages = [msg for msg in messages if msg.get('role') == 'user']
    assistant_messages = [msg for msg in messages if msg.get('role') == 'assistant']
    
    # Sempre manter a última mensagem do usuário
    last_user_message = user_messages.pop() if user_messages else None
    
    # Criar histórico otimizado
    optimized_history = []
    if system_message:
        optimized_history.append(system_message)
    
    # Adicionar resumo se houver histórico significativo para sumarizar
    if len(user_messages) > 2 or len(assistant_messages) > 2:
        context_summary = "Histórico anterior resumido: "
        context_summary += ", ".join([f"Usuário perguntou sobre {msg['content'][:30]}..." for msg in user_messages[:3]])
        optimized_history.append({"role": "system", "content": context_summary})
    
    # Adicionar algumas mensagens recentes para manter contexto
    recent_pairs = min(2, min(len(user_messages), len(assistant_messages)))
    for i in range(recent_pairs):
        idx = -1 - i
        if idx >= -len(user_messages):
            optimized_history.append(user_messages[idx])
        if idx >= -len(assistant_messages):
            optimized_history.append(assistant_messages[idx])
    
    # Adicionar última mensagem do usuário
    if last_user_message:
        optimized_history.append(last_user_message)
    
    return optimized_history


# Function to get response from Ollama
# Otimizar a função get_ollama_response para streaming mais fluido
def get_ollama_response(message, session_id):
    """Get response from Ollama model"""
    global current_model, current_profile
    
    try:
        # Get the prompt template from the current profile
        profile_data = PROMPT_PROFILES.get(current_profile, {})
        prompt_template = profile_data.get('prompt_template', "You are a helpful assistant.")
        parameters = profile_data.get('parameters', {})
        
        # Verificar se o cliente solicitou manter apenas a última mensagem
        keep_last_only = request.json.get('keep_last_only', False)
        
        # Get or create chat history for this session
        if session_id not in chat_histories:
            chat_histories[session_id] = []
        
        # Se keep_last_only for True, limpar o histórico anterior
        if keep_last_only and chat_histories[session_id]:
            # Manter apenas a mensagem do sistema, se existir
            system_messages = [msg for msg in chat_histories[session_id] if msg.get("role") == "system"]
            chat_histories[session_id] = system_messages
        
        # Add user message to history
        chat_histories[session_id].append({"role": "user", "content": message})
        
        # Otimizar parâmetros para resposta mais rápida
        optimized_parameters = parameters.copy()
        
        # Adicionar ou ajustar parâmetros para melhorar a velocidade
        optimized_parameters.update({
            "num_ctx": 2048,  # Reduzir o contexto para processamento mais rápido
            "num_thread": 4,  # Aumentar threads para paralelização
            "temperature": 0.7,  # Temperatura moderada para equilíbrio entre criatividade e velocidade
            "top_p": 0.9,  # Valor mais alto para respostas mais diretas
            "repeat_penalty": 1.1,  # Penalidade leve para repetições
            "seed": -1,  # Seed aleatório
            "mirostat": 0,  # Desativar mirostat para maior velocidade
        })
        
        # Prepare the messages for the API - usar apenas as últimas 4 mensagens para contexto mais amplo
        messages = chat_histories[session_id][-4:] if len(chat_histories[session_id]) > 4 else chat_histories[session_id]
        
        # Add system message with prompt template if not already present
        if not any(msg.get("role") == "system" for msg in messages):
            messages.insert(0, {"role": "system", "content": prompt_template})
        
        logger.info(f"Enviando requisição para o modelo {current_model} com {len(messages)} mensagens no histórico")
        
        # Iniciar temporizador
        start_time = time.time()
        
        # Enviar sinal de início de processamento
        yield "<PROCESSING_STARTED>"
        
        # Make the API request to Ollama
        response = session.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": current_model,
                "messages": messages,
                "stream": True,
                "options": optimized_parameters
            },
            stream=True,
            timeout=(5, 60)  # 5s connect, 60s read
        )
             
        if response.status_code != 200:
            logger.error(f"Erro na API do Ollama: {response.status_code}, {response.text}")
            yield f"Erro na API do Ollama: {response.status_code}"
            return
        
        # Process the streaming response
        full_response = ""
        buffer = ""
        last_update_time = time.time()
        
        for line in response.iter_lines():
            if line:
                try:
                    data = json.loads(line.decode('utf-8'))
                    if 'message' in data and 'content' in data['message']:
                        chunk = data['message']['content']
                        full_response += chunk
                        buffer += chunk
                        
                        # Enviar chunks menores para uma experiência mais fluida
                        current_time = time.time()
                        if len(buffer) >= 5 or current_time - last_update_time >= 0.1 or data.get('done', False):
                            yield buffer
                            buffer = ""
                            last_update_time = current_time
                            
                        # Enviar sinal de processamento a cada 2 segundos para manter a conexão viva
                        if current_time - last_update_time > 2:
                            yield "<STILL_PROCESSING>"
                            last_update_time = current_time
                except json.JSONDecodeError:
                    logger.warning(f"Erro ao decodificar resposta: {line}")
        
        # Garantir que qualquer texto restante no buffer seja enviado
        if buffer:
            yield buffer
        
        # Calcular tempo total
        end_time = time.time()
        total_time = end_time - start_time
        logger.info(f"Tempo total de resposta: {total_time:.2f}s")
        
        # Enviar marcador de conclusão com tempo
        yield f"<RESPONSE_COMPLETE>{total_time:.2f}"
        
        # Add assistant response to history
        if full_response:
            chat_histories[session_id].append({"role": "assistant", "content": full_response})
        else:
            logger.warning("Resposta vazia recebida do modelo")
            
    except requests.exceptions.RequestException as e:
        logger.error(f"Erro de conexão com Ollama: {str(e)}")
        yield f"Erro de conexão com o servidor Ollama: {str(e)}"
    except Exception as e:
        logger.error(f"Erro ao processar resposta: {str(e)}")
        yield f"Erro ao processar resposta: {str(e)}"


# Otimizar a rota de chat
@app.route('/chat', methods=['POST'])
def chat():
    global last_activity_time
    
    # Atualiza o timestamp de última atividade
    with warmup_lock:
        last_activity_time = time.time()
    
    start_time = time.time()
    message = request.json.get('message', '')
    
    # Validar a mensagem
    if not message or len(message.strip()) == 0:
        return Response("Mensagem vazia", status=400)
    
    if len(message) > MAX_MESSAGE_LENGTH:
        return Response(f"Mensagem muito longa (máximo: {MAX_MESSAGE_LENGTH} caracteres)", status=400)
    
    # Gerar um ID de sessão único se não existir
    session_id = request.json.get('session_id', str(uuid.uuid4()))
    
    def generate():
        try:
            # Envia um marcador inicial para indicar que o processamento começou
            yield "<PROCESSING_STARTED>"
            
            # Verificar disponibilidade do modelo de forma mais eficiente - usar resultado em cache se verificado recentemente
            if not hasattr(generate, '_last_model_check_time') or \
               time.time() - getattr(generate, '_last_model_check_time', 0) > 60:
                is_available, _ = is_model_available(current_model)
                setattr(generate, '_last_model_check_time', time.time())
                setattr(generate, '_last_model_check_result', is_available)
            else:
                is_available = getattr(generate, '_last_model_check_result', True)
            
            if not is_available:
                yield f"O modelo {current_model} não está disponível no momento. Tente novamente mais tarde."
                return
                
            # Indicador de progresso para respostas longas
            progress_thread = None
            progress_active = True
            
            def progress_indicator():
                wait_time = 0
                while progress_active and wait_time < 30:  # Limite de 30 segundos para timeout
                    time.sleep(5)  # Verificar a cada 5 segundos
                    wait_time += 5
                    if progress_active:  # Se ainda estiver ativo, enviar indicador
                        yield "<STILL_PROCESSING>"
            
            # Iniciar indicador de progresso
            progress_thread = threading.Thread(target=progress_indicator, daemon=True)
            progress_thread.start()
            
            # Obter resposta do modelo
            content_sent = False
            for chunk in get_ollama_response(message, session_id):
                if chunk:
                    content = format_latex(chunk)
                    yield f"{content}"
                    content_sent = True
                    
            # Finalizar indicador de progresso
            progress_active = False
            
            # Se nenhum conteúdo foi enviado, enviar mensagem de erro
            if not content_sent:
                yield "O modelo não retornou uma resposta. Tente novamente."
            
            # Calcula o tempo total e o envia junto com o marcador de conclusão
            total_time = time.time() - start_time
            yield f"<RESPONSE_COMPLETE>{total_time:.2f}"
            logger.info(f"Tempo total de resposta: {total_time:.2f}s")
        except Exception as e:
            error_details = {
                'error_type': type(e).__name__,
                'error_message': str(e),
                'traceback': traceback.format_exc()
            }
            logger.error(f"Erro detalhado no chat: {json.dumps(error_details, indent=2)}")
            yield f"Erro ao processar sua solicitação: {type(e).__name__} - {str(e)}"

    return Response(stream_with_context(generate()), mimetype='text/plain')




# Modificar o bloco principal para usar o modelo já carregado no Ollama
if __name__ == '__main__':
    # Verificar se estamos no processo principal do Flask
    # O Flask em modo debug cria dois processos, e queremos carregar o modelo apenas uma vez
    import os
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true' or not app.debug:
        # Obter modelos disponíveis apenas uma vez
        available_models, default_model = get_available_models()
        
        if not available_models:
            logger.error("Nenhum modelo disponível no Ollama. Verifique se o Ollama está rodando.")
            print("ERRO: Nenhum modelo disponível no Ollama. Verifique se o OllaMa está rodando.")
            exit(1)
        
        # Verificar o modelo atual usando a lista já obtida
        current_model_available = any(
            model == current_model or model.startswith(f"{current_model}:") 
            for model in available_models
        )
        
        if current_model_available:
            # Encontrar o nome exato do modelo (com tag, se houver)
            current_model = next(
                model for model in available_models 
                if model == current_model or model.startswith(f"{current_model}:")
            )
            logger.info(f"Usando o modelo disponível: {current_model}")
        else:
            # Usar o primeiro modelo disponível
            current_model = default_model
            logger.info(f"Modelo {DEFAULT_MODEL} não disponível. Usando o modelo padrão: {current_model}")
        
        # Pré-aquecer o modelo com uma mensagem de saudação
        warmup_model_with_greeting(current_model)
        
        # Iniciar thread de warmup
        warmup_thread = threading.Thread(target=keep_model_warm, daemon=True)
        warmup_thread.start()
        
        logger.info("Modelo carregado e thread de warmup iniciada")
    else:
        logger.info("Processo de recarregamento do Flask - pulando carregamento do modelo")
    
    # Iniciar o Flask
    logger.info("Iniciando servidor Flask...")
    app.run(host='0.0.0.0', port=5000, debug=False)