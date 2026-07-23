/**
 * Nomes por nacionalidade + utilitários de deduplicação e renomeação do elenco.
 */

const BRAZIL = 'Brasil';

const int = (random, lo, hi) => lo + Math.floor(random() * (hi - lo + 1));

export const PLAYER_NAME_POOLS = {
  [BRAZIL]: {
    first: [
      'Adriano', 'André', 'Arthur', 'Breno', 'Bruno', 'Caio', 'Carlos', 'Cristian', 'Daniel', 'Davi',
      'Diego', 'Douglas', 'Eduardo', 'Enzo', 'Erick', 'Fábio', 'Felipe', 'Fernando', 'Gabriel', 'Guilherme',
      'Gustavo', 'Heitor', 'Henrique', 'Hugo', 'Igor', 'Ítalo', 'João', 'Kaique', 'Leandro', 'Leonardo',
      'Lucas', 'Luiz', 'Marcelo', 'Marcos', 'Matheus', 'Miguel', 'Murilo', 'Nathan', 'Nicolas', 'Otávio',
      'Paulo', 'Pedro', 'Rafael', 'Renan', 'Rodrigo', 'Samuel', 'Thiago', 'Vitor', 'Victor', 'Wesley',
    ],
    last: [
      'Almeida', 'Alves', 'Amaral', 'Andrade', 'Araújo', 'Barbosa', 'Batista', 'Cardoso', 'Carvalho', 'Castro',
      'Correia', 'Costa', 'Cunha', 'Dias', 'Duarte', 'Esteves', 'Ferreira', 'Freitas', 'Garcia', 'Gomes',
      'Henrique', 'Leite', 'Lima', 'Lopes', 'Machado', 'Marques', 'Martins', 'Mendes', 'Monteiro', 'Moreira',
      'Moura', 'Nascimento', 'Neves', 'Nunes', 'Oliveira', 'Pereira', 'Pires', 'Ramos', 'Reis', 'Ribeiro',
      'Rocha', 'Rodrigues', 'Santos', 'Silva', 'Soares', 'Souza', 'Teixeira', 'Vieira',
    ],
  },
  Argentina: {
    first: [
      'Agustín', 'Alejandro', 'Bruno', 'Cristian', 'Emiliano', 'Enzo', 'Facundo', 'Franco', 'Gonzalo', 'Guido',
      'Ignacio', 'Julián', 'Lautaro', 'Leandro', 'Lucas', 'Marcos', 'Mateo', 'Maximiliano', 'Nahuel', 'Nicolás',
      'Pablo', 'Rodrigo', 'Santiago', 'Thiago', 'Tomás', 'Valentín', 'Walter',
    ],
    last: [
      'Acuña', 'Álvarez', 'Batalla', 'Correa', 'Di María', 'Fernández', 'Garnacho', 'Gómez', 'López', 'Martínez',
      'Messi', 'Montiel', 'Otamendi', 'Paredes', 'Romero', 'Rossi', 'Sánchez', 'Torres', 'Vargas', 'Zapata',
    ],
  },
  Uruguai: {
    first: [
      'Agustín', 'Bruno', 'Darwin', 'Diego', 'Facundo', 'Federico', 'Gastón', 'Giorgian', 'José', 'Lucas',
      'Manuel', 'Matías', 'Maximiliano', 'Nahitan', 'Nicolás', 'Rodrigo', 'Sebastián', 'Santiago', 'Valverde', 'Walter',
    ],
    last: [
      'Araujo', 'Bentancur', 'Cáceres', 'Cavani', 'Coates', 'De La Cruz', 'Giménez', 'Godín', 'Lodeiro', 'Núñez',
      'Olivera', 'Pellistri', 'Rodríguez', 'Suárez', 'Torreira', 'Valverde', 'Viña', 'Varela',
    ],
  },
  Paraguai: {
    first: [
      'Alberto', 'Antonio', 'Carlos', 'César', 'Diego', 'Gustavo', 'Hernán', 'Jorge', 'Julio', 'Miguel',
      'Nelson', 'Oscar', 'Ramón', 'Richard', 'Roberto', 'Santiago', 'Víctor', 'Walter',
    ],
    last: [
      'Almirón', 'Cardozo', 'Cáceres', 'Espínola', 'Giménez', 'Gómez', 'Martínez', 'Moreno', 'Ortiz', 'Romero',
      'Sanabria', 'Santander', 'Valdez', 'Villalba',
    ],
  },
  Colombia: {
    first: [
      'Andrés', 'Carlos', 'Daniel', 'David', 'Duván', 'Edwin', 'James', 'Jefferson', 'Jhon', 'Johan',
      'Juan', 'Luis', 'Mateo', 'Miguel', 'Radamel', 'Sebastián', 'Steven', 'Yerry', 'Yerson', 'Wilmar',
    ],
    last: [
      'Barrios', 'Borja', 'Cuadrado', 'Díaz', 'Falcao', 'Lerma', 'Mina', 'Muriel', 'Ospina',
      'Quintero', 'Rodríguez', 'Sánchez', 'Zapata',
    ],
  },
  Venezuela: {
    first: [
      'Adalberto', 'Alejandro', 'Andrés', 'Carlos', 'Fernando', 'Gabriel', 'Jhon', 'Jhonny', 'Josef', 'Júnior',
      'Luis', 'Roberto', 'Salomón', 'Tomás', 'Wilker', 'Yangel', 'Yeferson', 'Yonathan',
    ],
    last: [
      'Castillo', 'Farfán', 'González', 'Herrera', 'Machís', 'Martínez', 'Moreno', 'Otero', 'Rincón', 'Rondón',
      'Rosales', 'Soteldo', 'Velásquez', 'Villanueva',
    ],
  },
  Equador: {
    first: [
      'Antonio', 'Carlos', 'Christian', 'Enner', 'Felipe', 'Gonzalo', 'Jordy', 'José', 'Kevin', 'Michael',
      'Moisés', 'Pervis', 'Renato', 'Sebastián', 'Willian',
    ],
    last: [
      'Arboleda', 'Caicedo', 'Cifuentes', 'Domínguez', 'Estupiñán', 'Gruezo', 'Hincapié', 'Ibarra', 'Mena', 'Plata',
      'Preciado', 'Valencia', 'Vera',
    ],
  },
  Chile: {
    first: [
      'Alexis', 'Arturo', 'Carlos', 'Charles', 'Claudio', 'Eduardo', 'Erick', 'Felipe', 'Gary', 'Guillermo',
      'Jean', 'Marcelo', 'Nicolás', 'Paulo', 'Víctor',
    ],
    last: [
      'Bravo', 'Castillo', 'Contreras', 'Díaz', 'González', 'Isla', 'Medel', 'Pulgar', 'Sánchez', 'Silva',
      'Tapia', 'Vargas', 'Vidal',
    ],
  },
  Europa: {
    first: [
      'Adrian', 'Alexander', 'Andreas', 'Antoine', 'Benjamin', 'Christian', 'Daniel', 'David', 'Erik', 'Fabian',
      'Felix', 'Florian', 'Hans', 'Jan', 'Jonas', 'Julian', 'Karl', 'Leon', 'Lukas', 'Marco',
      'Martin', 'Max', 'Niklas', 'Oliver', 'Patrick', 'Paul', 'Philip', 'Sebastian', 'Simon', 'Thomas',
    ],
    last: [
      'Bauer', 'Becker', 'Fischer', 'Hoffmann', 'Keller', 'Klein', 'Koch', 'Lang', 'Meyer', 'Richter',
      'Schmid', 'Schneider', 'Schulz', 'Schwarz', 'Vogel', 'Weber', 'Werner', 'Wolf', 'Zimmermann',
    ],
  },
  Alemanha: {
    first: [
      'Alexander', 'Andreas', 'Benjamin', 'Christian', 'Daniel', 'Fabian', 'Felix', 'Florian', 'Jan', 'Jonas',
      'Julian', 'Karl', 'Leon', 'Lukas', 'Marco', 'Martin', 'Max', 'Niklas', 'Sebastian', 'Simon', 'Thomas',
    ],
    last: [
      'Bauer', 'Becker', 'Fischer', 'Hoffmann', 'Keller', 'Klein', 'Koch', 'Lang', 'Meyer', 'Richter',
      'Schmid', 'Schneider', 'Schulz', 'Schwarz', 'Vogel', 'Weber', 'Werner', 'Wolf', 'Zimmermann',
    ],
  },
  França: {
    first: [
      'Adrien', 'Alexandre', 'Antoine', 'Arthur', 'Aurélien', 'Benjamin', 'Clément', 'Florian', 'Hugo', 'Jules',
      'Kylian', 'Lucas', 'Matteo', 'Maxime', 'Nicolas', 'Olivier', 'Paul', 'Raphaël', 'Théo', 'Vincent',
    ],
    last: [
      'Bernard', 'Blanc', 'Bonnet', 'Dupont', 'Durand', 'Fournier', 'Garnier', 'Girard', 'Laurent', 'Lefebvre',
      'Leroy', 'Martin', 'Mercier', 'Moreau', 'Petit', 'Roux', 'Simon', 'Thomas', 'Vincent',
    ],
  },
  Espanha: {
    first: [
      'Alejandro', 'Álvaro', 'Carlos', 'Daniel', 'David', 'Diego', 'Fernando', 'Iago', 'Jorge', 'José',
      'Marcos', 'Miguel', 'Nico', 'Pablo', 'Pedro', 'Rodrigo', 'Sergio', 'Unai', 'Víctor',
    ],
    last: [
      'Castro', 'Díaz', 'Fernández', 'García', 'González', 'Hernández', 'Jiménez', 'López', 'Martínez', 'Moreno',
      'Muñoz', 'Navarro', 'Pérez', 'Ramírez', 'Rodríguez', 'Romero', 'Ruiz', 'Sánchez', 'Torres',
    ],
  },
  Inglaterra: {
    first: [
      'Ben', 'Callum', 'Charlie', 'Declan', 'Harry', 'Jack', 'James', 'Joe', 'Jordan', 'Jude', 'Kyle',
      'Luke', 'Marcus', 'Mason', 'Phil', 'Raheem', 'Reece', 'Trent', 'Tyler',
    ],
    last: [
      'Brown', 'Clark', 'Evans', 'Hall', 'Johnson', 'Jones', 'Miller', 'Moore', 'Robinson', 'Smith',
      'Taylor', 'Thomas', 'Walker', 'White', 'Wilson', 'Wright', 'Young',
    ],
  },
  Holanda: {
    first: [
      'Bas', 'Daan', 'Daley', 'Denzel', 'Frenkie', 'Jasper', 'Luuk', 'Matthijs', 'Memphis', 'Steven',
      'Teun', 'Tim', 'Virgil', 'Wout', 'Xavi',
    ],
    last: [
      'Bakker', 'Blind', 'De Jong', 'De Ligt', 'Depay', 'Dijk', 'Jansen', 'Mulder', 'Peters', 'Visser',
      'Vries', 'Willems',
    ],
  },
  Portugal: {
    first: [
      'André', 'Bernardo', 'Bruno', 'Diogo', 'Francisco', 'Gonçalo', 'João', 'Nuno', 'Pedro', 'Rafael',
      'Ricardo', 'Rúben', 'Tiago', 'Vítor',
    ],
    last: [
      'Almeida', 'Carvalho', 'Costa', 'Fernandes', 'Ferreira', 'Gomes', 'Martins', 'Mendes', 'Oliveira', 'Pereira',
      'Ribeiro', 'Silva', 'Sousa',
    ],
  },
  Croácia: {
    first: [
      'Ante', 'Borna', 'Domagoj', 'Ivan', 'Josip', 'Lovro', 'Luka', 'Marcelo', 'Mario', 'Mateo', 'Nikola',
      'Petar', 'Stipe', 'Tomislav', 'Vedran',
    ],
    last: [
      'Babić', 'Brozović', 'Kovačić', 'Lovren', 'Mandžukić', 'Modrić', 'Perišić', 'Rebić', 'Vida', 'Vrsaljko',
    ],
  },
  Bélgica: {
    first: [
      'Axel', 'Charles', 'Dries', 'Eden', 'Jan', 'Kevin', 'Leander', 'Romelu', 'Thibaut', 'Thomas', 'Yannick',
    ],
    last: [
      'Castagne', 'De Bruyne', 'Hazard', 'Lukaku', 'Mertens', 'Tielemans', 'Vertonghen', 'Witsel',
    ],
  },
  África: {
    first: [
      'Abdou', 'Amadou', 'Boubacar', 'Cheikh', 'Ibrahim', 'Issa', 'Karim', 'Mamadou', 'Moussa', 'Ousmane',
      'Pape', 'Samuel', 'Seydou', 'Youssef', 'Zakaria',
    ],
    last: [
      'Ba', 'Camara', 'Cissé', 'Diallo', 'Diop', 'Fall', 'Koné', 'Ndiaye', 'Sarr', 'Sy',
      'Touré', 'Traoré',
    ],
  },
  Ásia: {
    first: [
      'Akira', 'Chen', 'Daichi', 'Hassan', 'Hiroshi', 'Kenji', 'Li', 'Min', 'Mohammad', 'Ravi',
      'Ren', 'Takeshi', 'Wei', 'Yuki',
    ],
    last: [
      'Ali', 'Hassan', 'Huang', 'Ito', 'Khan', 'Kim', 'Lee', 'Nakamura', 'Park', 'Sato',
      'Singh', 'Tanaka', 'Wang', 'Yamamoto',
    ],
  },
  Concacaf: {
    first: [
      'Alejandro', 'Carlos', 'Diego', 'Eduardo', 'Hector', 'Javier', 'Jose', 'Luis', 'Manuel', 'Miguel',
      'Ricardo', 'Roberto',
    ],
    last: [
      'Castro', 'Flores', 'Garcia', 'Gomez', 'Hernandez', 'Lopez', 'Martinez', 'Morales', 'Ramirez', 'Reyes',
      'Rivera', 'Torres',
    ],
  },
};

const normalizeNameKey = value =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR');

export function normalizePlayerDisplayName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function rollPlayerName({ nationality = BRAZIL, index = 0, random = Math.random } = {}) {
  const pool = PLAYER_NAME_POOLS[nationality] || PLAYER_NAME_POOLS[BRAZIL];
  const first = pool.first[(index + int(random, 0, pool.first.length - 1)) % pool.first.length];
  const last = pool.last[(index * 3 + int(random, 0, pool.last.length - 1)) % pool.last.length];
  const secondLast =
    random() < 0.12 && nationality === BRAZIL
      ? ` ${pool.last[(index * 7 + int(random, 0, pool.last.length - 1)) % pool.last.length]}`
      : '';
  return `${first} ${last}${secondLast}`;
}

/** Evita homônimos no elenco (sufixo " 2", " 3", …). */
export function dedupeRosterNames(roster) {
  if (!Array.isArray(roster)) return roster;
  const seen = new Map();
  roster.forEach(player => {
    if (!player?.name) return;
    const key = normalizeNameKey(player.name);
    const count = seen.get(key) || 0;
    seen.set(key, count + 1);
    if (count) player.name = `${player.name} ${count + 1}`;
  });
  return roster;
}

/** Estrangeiros recebem nomes do país de origem (geração + migração única). */
export function ensureForeignPlayerNames(roster, { random = Math.random, skipCustomized = true } = {}) {
  if (!Array.isArray(roster)) return roster;
  roster.forEach((player, index) => {
    if (!player || typeof player !== 'object') return;
    if (skipCustomized && player.nameCustomized) return;
    const nationality = player.nationality || BRAZIL;
    if (nationality === BRAZIL) {
      player.nameNationalityKey = BRAZIL;
      return;
    }
    if (player.nameNationalityKey === nationality) return;
    player.name = rollPlayerName({ nationality, index, random });
    player.nameNationalityKey = nationality;
  });
  dedupeRosterNames(roster);
  return roster;
}

export function rosterNameConflict(roster, candidateName, { ignorePlayerId = null } = {}) {
  const key = normalizeNameKey(candidateName);
  if (!key) return 'empty';
  return roster.some(player => {
    if (!player?.name) return false;
    if (ignorePlayerId && player.playerId === ignorePlayerId) return false;
    return normalizeNameKey(player.name) === key;
  })
    ? 'duplicate'
    : null;
}

export function playerRenameBlocked(player, currentSeason) {
  if (!player) return { blocked: true, reason: 'Jogador não encontrado.' };
  const season = Number(currentSeason);
  const renamedSeason = Number(player.nameRenamedSeason);
  if (Number.isFinite(season) && Number.isFinite(renamedSeason) && renamedSeason === season) {
    return {
      blocked: true,
      reason: `Renomeado na temporada ${season}. Nova alteração só na próxima temporada.`,
    };
  }
  return { blocked: false };
}

export function validatePlayerRename(candidateName, roster, { ignorePlayerId = null } = {}) {
  const name = normalizePlayerDisplayName(candidateName);
  if (!name) return { ok: false, error: 'Informe um nome.' };
  if (name.length < 2) return { ok: false, error: 'Nome muito curto (mín. 2 caracteres).' };
  if (name.length > 40) return { ok: false, error: 'Nome muito longo (máx. 40 caracteres).' };
  if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(name)) return { ok: false, error: 'Use pelo menos uma letra.' };
  const conflict = rosterNameConflict(roster, name, { ignorePlayerId });
  if (conflict === 'duplicate') return { ok: false, error: 'Já existe outro jogador com este nome no elenco.' };
  return { ok: true, name };
}

export function renamePlayerInRoster(roster, playerId, candidateName, { currentSeason = null } = {}) {
  const check = validatePlayerRename(candidateName, roster, { ignorePlayerId: playerId });
  if (!check.ok) return check;
  const player = roster.find(entry => entry?.playerId === playerId);
  if (!player) return { ok: false, error: 'Jogador não encontrado.' };
  const block = playerRenameBlocked(player, currentSeason);
  if (block.blocked) return { ok: false, error: block.reason };
  const normalizedCurrent = normalizeNameKey(player.name);
  const normalizedNext = normalizeNameKey(check.name);
  if (normalizedCurrent === normalizedNext) {
    return { ok: true, name: check.name, player, unchanged: true };
  }
  player.name = check.name;
  player.nameCustomized = true;
  if (Number.isFinite(Number(currentSeason))) {
    player.nameRenamedSeason = Number(currentSeason);
  }
  return { ok: true, name: check.name, player };
}
