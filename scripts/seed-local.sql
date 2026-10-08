BEGIN;
INSERT INTO usuarios (nome,email,perfil)
VALUES ('Administrador de teste','admin@example.test','administrador'),
       ('Analista de teste','analista@example.test','analista'),
       ('Solicitante de teste','solicitante@example.test','solicitante')
ON CONFLICT (email) DO NOTHING;
INSERT INTO conteudos (titulo,tipo,ano_producao,pais_origem,sinopse,duracao_min)
SELECT 'Filme de demonstração','filme',2026,'Brasil','Conteúdo fictício para testes locais.',90
WHERE NOT EXISTS (SELECT 1 FROM conteudos WHERE titulo='Filme de demonstração');
INSERT INTO solicitacoes (conteudo_id,solicitante_id,observacoes)
SELECT c.id,u.id,'Solicitação fictícia para testes'
FROM conteudos c, usuarios u
WHERE c.titulo='Filme de demonstração' AND u.email='solicitante@example.test'
AND NOT EXISTS (SELECT 1 FROM solicitacoes s WHERE s.conteudo_id=c.id AND s.solicitante_id=u.id);
INSERT INTO descritores (nome,categoria,descricao)
SELECT 'Violência de teste','violencia','Descritor fictício para validar a interface'
WHERE NOT EXISTS (SELECT 1 FROM descritores WHERE nome='Violência de teste');
COMMIT;
