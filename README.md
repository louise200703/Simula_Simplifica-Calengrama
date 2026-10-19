<div align="center">
  <img src="assets/calendula.png" alt="Flor dourada que representa o Calêngrama" width="120">
  <h1>Calêngrama</h1>
  <p><strong>Seu calendário acadêmico, no seu ritmo.</strong></p>
  <p>Calendário acadêmico com planejamento personalizado de estudos, desenvolvido como projeto prático do Simula &amp; Simplifica.</p>
</div>

<div align="center">🌐 Acesse o Calêngrama: 
https://louise200703.github.io/Simula_Simplifica-Calengrama/</div>

--

## Sobre o projeto

Conciliar disciplinas, aulas, exercícios, trabalhos e prazos pode transformar o planejamento do semestre em uma tarefa por si só. O **Calêngrama** foi pensado para ajudar estudantes a organizar essas atividades em um calendário de estudos ajustado à própria rotina.

A aplicação permite cadastrar conteúdos e prazos, configurar horários disponíveis durante a semana e gerar uma proposta de cronograma. O planejamento leva em consideração a sequência dos conteúdos, os pré-requisitos dos trabalhos e as preferências de distribuição das disciplinas.

O projeto utiliza regras e algoritmos de planejamento. **A geração do cronograma não depende de inteligência artificial.**

## Funcionalidades

### Organização acadêmica

- Cadastro e edição de disciplinas, unidades, aulas e exercícios.
- Cor personalizada para cada disciplina, com prévia visual e campo de código HEX.
- Cadastro e acompanhamento de trabalhos, relatórios e outras atividades acadêmicas.
- Projetos organizados em etapas numeradas, com status, progresso e estimativa de duração por etapa.
- Vínculo entre trabalhos e disciplinas, com pré-requisitos específicos de aulas ou unidades.
- Filtro dos pré-requisitos para exibir o conteúdo da disciplina selecionada.

### Rotina personalizada

- Configuração de diferentes intervalos de estudo para cada dia da semana.
- Cadastro de compromissos pontuais que bloqueiam horários específicos.
- Definição de uma meta diária de estudo, tratada como objetivo normal e não como limite absoluto.
- Aproveitamento de horários livres além da meta quando a capacidade normal não for suficiente para cumprir um prazo, respeitando compromissos e intervalos disponíveis.
- Preferência por disciplina para participar de períodos mesclados ou tentar ficar em um dia exclusivo.
- Limite configurável de disciplinas de conteúdo por dia. Trabalhos e etapas de projetos não entram nessa contagem.

### Cronograma e acompanhamento

- Geração automática de sessões de estudo a partir dos dados cadastrados.
- Visualização semanal e mensal do calendário.
- Respeito à ordem pedagógica das unidades e aulas.
- Planejamento de trabalhos somente depois dos conteúdos definidos como pré-requisitos.
- Etapas de projetos planejadas em sua ordem numérica.
- Status de atividade: **não iniciada**, **em andamento** (com porcentagem de conclusão informada pelo usuário) e **concluída**.
- Reorganização do planejamento após atualizações de progresso e sessões não concluídas.
- Avisos quando as restrições de prazo e disponibilidade impedem acomodar uma atividade, mesmo depois de considerar horários livres além da meta.
- Atualização dos nomes das aulas no calendário quando o cadastro é editado.

### Interface

- Menu lateral recolhível.
- Ações de criação contextuais para cada seção.
- Interface responsiva para diferentes tamanhos de tela.
- Identidade visual inspirada na calêndula, com uma flor personalizada.

## Tecnologias utilizadas

- **HTML5** para a estrutura semântica.
- **CSS3** para layout, identidade visual e responsividade.
- **JavaScript puro (Vanilla JavaScript)** para interatividade e lógica de planejamento.
- **LocalStorage** para salvar os dados no navegador.
- **Node.js** para executar os testes automatizados do algoritmo.

A aplicação não exige framework, backend, conta de usuário ou serviço externo para suas funcionalidades principais.

## Limitações e cuidados

- Os dados são armazenados no `LocalStorage` do navegador. Eles não são enviados para uma conta ou banco de dados remoto e não são sincronizados automaticamente entre dispositivos.
- Limpar os dados do site ou do navegador pode apagar os registros salvos. Durante o desenvolvimento, abra a aplicação sempre pela mesma origem (protocolo, endereço e porta).
- O cronograma é uma proposta calculada por regras. Durações estimadas e progresso informado podem não refletir perfeitamente o tempo real necessário; revise o planejamento, principalmente antes de prazos importantes.
- A meta diária é uma preferência para o planejamento normal. Quando a capacidade dentro das metas não for suficiente para atender um prazo, o sistema pode ocupar outros intervalos realmente livres antes de sinalizar a atividade como não acomodada.
- Se as restrições de disponibilidade e prazo forem incompatíveis, o sistema pode sinalizar atividades que não conseguiu acomodar.
- Os testes automatizados cobrem regras do algoritmo, mas não substituem a verificação manual da interface e dos fluxos completos no navegador.

## Autoria e apoio no desenvolvimento

O **Calêngrama** foi desenvolvido como projeto prático do **Simula & Simplifica**, com apoio do **ChatGPT** na elaboração, implementação e revisão de partes do código, na investigação de erros e na preparação dos testes. Os requisitos, as prioridades e a direção do projeto foram definidos e refinados ao longo do desenvolvimento, e as funcionalidades precisam ser verificadas na prática antes da entrega final.

O cronograma utiliza regras e algoritmos tradicionais; o uso do ChatGPT como apoio durante o desenvolvimento não significa que a aplicação gere rotinas por meio de inteligência artificial.

---

<div align="center">
  Desenvolvido com organização, código e uma pequena flor dourada. 🌼
</div>
